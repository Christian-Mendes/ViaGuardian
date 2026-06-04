/**
 * ActiveDrivingScreen.jsx
 *
 * Tela de Condução Ativa — Estado DRIVING da FSM.
 *
 * Responsabilidades:
 *   • Renderizar o feed de câmera em tempo real (dashcam AR pass-through)
 *   • Executar frame processors TFLite para inferência YOLOv8-Nano quantizado
 *   • Sobrepor bounding boxes responsivas sobre anomalias detectadas
 *   • Disparar alertas multimodais (háptico + TTS) sem interação visual
 *   • Manter ZERO event listeners de UI ativos (Zero-Touch policy)
 *   • Controlar performance térmica adaptativa (thermal throttling)
 *
 * ─── Fluxo de Privacidade LGPD ─────────────────────────────────────
 *   Frame (RAM) → TFLite inference → detectionsArray → buildPayload()
 *       ↓                                                    ↓
 *   [DESCARTADO] frame sai do escopo imediatamente    [ENFILEIRADO] apenas metadados JSON
 * ───────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, Text, Animated, Dimensions } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera'
import { runOnJS } from 'react-native-reanimated'

import { useTelemetryStore, AnomalyClass } from '../store/telemetryStore'
import { buildAnonymizedPayload } from '../utils/payloadBuilder'
import { triggerAlert } from '../utils/multimodalAlert'
import { runYOLOInference, MODEL_CONFIG } from '../utils/tfliteProcessor'
import { thermalController, ThermalState } from '../utils/thermalThrottling'

// ─────────────────────────────────────────────────────────
// Limiar mínimo de confiança para aceitar uma detecção.
// Abaixo disto, o frame é descartado sem registro.
// ─────────────────────────────────────────────────────────
const CONFIDENCE_THRESHOLD = MODEL_CONFIG.confidenceThreshold  // 0.70

// ─────────────────────────────────────────────────────────
// Mapeamento de classe → cor da bounding box (esquema estrito)
// Amarelo: anomalias de infraestrutura
// Vermelho: riscos críticos de colisão
// Branco: rastreamento neutro
// ─────────────────────────────────────────────────────────
const BBOX_COLORS = {
  [AnomalyClass.POTHOLE]:       '#FBBF24', // amarelo (infraestrutura)
  [AnomalyClass.FADED_LANE]:    '#FBBF24', // amarelo (infraestrutura)
  [AnomalyClass.OBSTRUCTION]:   '#FBBF24', // amarelo (infraestrutura)
  [AnomalyClass.NEAR_MISS]:     '#EF4444', // vermelho (risco crítico)
  [AnomalyClass.RISK_BEHAVIOR]: '#EF4444', // vermelho (risco crítico)
  default:                      '#FFFFFF', // branco (neutro)
}

// ─────────────────────────────────────────────────────────
// Componente de Bounding Box sobreposta (AR overlay)
// Renderiza retângulo animado com cantos estilizados
// ─────────────────────────────────────────────────────────
function BoundingBox({ detection, frameWidth, frameHeight }) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!detection) return
    
    // Animação: fade in rápido → hold → fade out suave
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [detection, opacity])

  if (!detection?.bbox) return null

  const { x, y, w, h } = detection.bbox
  const color = BBOX_COLORS[detection.anomalyClass] ?? BBOX_COLORS.default

  // Converte coordenadas percentuais para pixels absolutos
  const left   = (x / 100) * frameWidth
  const top    = (y / 100) * frameHeight
  const width  = (w / 100) * frameWidth
  const height = (h / 100) * frameHeight

  return (
    <Animated.View
      style={[
        styles.bboxContainer,
        { left, top, width, height, borderColor: color, opacity }
      ]}
      pointerEvents="none"
    >
      {/* Label: classe + confiança */}
      <View style={[styles.bboxLabel, { backgroundColor: color }]}>
        <Text style={styles.bboxLabelText}>
          {detection.anomalyClass.toUpperCase()} {(detection.confidence * 100).toFixed(0)}%
        </Text>
      </View>
      
      {/* Cantos estilizados (design dashcam) */}
      <View style={[styles.corner, styles.cornerTL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: color }]} />
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────
// Tela Principal
// ─────────────────────────────────────────────────────────
export function ActiveDrivingScreen() {
  const device = useCameraDevice('back')
  const currentLocation = useTelemetryStore((s) => s.currentLocation)
  const currentSpeed    = useTelemetryStore((s) => s.currentSpeed)
  const activeDetection = useTelemetryStore((s) => s.activeDetection)
  const registerDetection = useTelemetryStore((s) => s.registerDetection)
  const sessionStartedAt = useTelemetryStore((s) => s.session.sessionStartedAt)

  // Dimensões dinâmicas do frame (captura real do layout)
  const [frameDimensions, setFrameDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  })

  // Estado térmico e FPS adaptativo
  const [thermalState, setThermalState] = useState(ThermalState.NORMAL)
  const [currentFPS, setCurrentFPS] = useState(10)

  // Contador de tempo de sessão em tempo real
  const [sessionTime, setSessionTime] = useState('00:00:00')

  // Métricas de performance (desenvolvimento)
  const inferenceCountRef = useRef(0)
  const lastMetricsLog = useRef(0)

  // ─────────────────────────────────────────────────────────
  // Efeito: Atualiza tempo de sessão
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionStartedAt) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - new Date(sessionStartedAt).getTime()
      const hours = Math.floor(elapsed / 3600000)
      const minutes = Math.floor((elapsed % 3600000) / 60000)
      const seconds = Math.floor((elapsed % 60000) / 1000)
      setSessionTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionStartedAt])

  // ─────────────────────────────────────────────────────────
  // Efeito: Monitora mudanças de estado térmico
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = thermalController.onStateChange((newState) => {
      setThermalState(newState)
      setCurrentFPS(thermalController.getCurrentFPS())
    })

    return unsubscribe
  }, [])

  // ─────────────────────────────────────────────────────────
  // Efeito: Reseta métricas ao montar
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    thermalController.reset()
  }, [])

  // ─────────────────────────────────────────────────────────
  // Callback: Processa detecções na JS thread
  // ─────────────────────────────────────────────────────────
  const handleDetection = useCallback(
    async (anomalyClass, confidenceScore, bboxRaw, inferenceLatency) => {
      // Valida contexto (GPS necessário para telemetria)
      if (!currentLocation || confidenceScore < CONFIDENCE_THRESHOLD) return

      // Registra latência de inferência no thermal controller
      thermalController.recordInference(inferenceLatency)

      // Dispara feedback multimodal imediatamente (háptico + TTS)
      const isCritical =
        anomalyClass === AnomalyClass.NEAR_MISS ||
        anomalyClass === AnomalyClass.RISK_BEHAVIOR
      
      triggerAlert(anomalyClass, isCritical)

      // Constrói payload anonimizado e enfileira no store
      const payload = await buildAnonymizedPayload({
        anomalyClass,
        confidenceScore,
        location: currentLocation,
        bbox: bboxRaw,
      })

      registerDetection(payload)

      // Log de métricas (desenvolvimento)
      inferenceCountRef.current++
      const now = Date.now()
      if (now - lastMetricsLog.current > 10000) {  // log a cada 10s
        lastMetricsLog.current = now
        console.log('[ViaGuardian Perf]', thermalController.getMetrics())
      }
    },
    [currentLocation, registerDetection],
  )

  /**
   * Frame Processor com TFLite e Thermal Throttling.
   * 
   * FLUXO DE EXECUÇÃO:
   *   1. Verifica thermal throttling (pula frame se necessário)
   *   2. Executa inferência YOLOv8 Nano (TFLite quantizado INT8)
   *   3. Frame sai do escopo → GC libera memória automaticamente
   *   4. Passa metadados numéricos para JS thread via runOnJS
   * 
   * GARANTIA LGPD:
   *   - Frame NUNCA é serializado ou persistido
   *   - Apenas scalars são transferidos para JS
   *   - Nenhuma imagem sai do escopo da worklet
   */
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'

      // ── THERMAL THROTTLING ──────────────────────────────────────────────
      if (!thermalController.shouldProcessFrame()) {
        return  // Pula frame para economizar bateria
      }

      // ── INFERÊNCIA TFLite ───────────────────────────────────────────────
      const inferenceStart = Date.now()
      
      // Executa YOLOv8 Nano quantizado (redimensiona para 320×320)
      const detections = runYOLOInference(frame)
      
      const inferenceLatency = Date.now() - inferenceStart

      // ── FRAME SAI DO ESCOPO AQUI ────────────────────────────────────────
      // GC nativo libera buffer de vídeo imediatamente
      // ────────────────────────────────────────────────────────────────────

      // ── PROCESSA DETECÇÕES ──────────────────────────────────────────────
      if (detections.length > 0) {
        detections.forEach(detection => {
          runOnJS(handleDetection)(
            detection.class,
            detection.confidence,
            detection.bbox,
            inferenceLatency
          )
        })
      }
    },
    [handleDetection],
  )

  if (!device) {
    return (
      <View style={styles.noCamera}>
        <Text style={styles.noCameraText}>Câmera traseira não disponível</Text>
      </View>
    )
  }

  const speedKmh = (currentSpeed * 3.6).toFixed(0)

  // Indicador de estado térmico (cor)
  const thermalColor = {
    [ThermalState.NORMAL]: '#22C55E',     // verde
    [ThermalState.MODERATE]: '#F59E0B',   // laranja
    [ThermalState.CRITICAL]: '#EF4444',   // vermelho
  }[thermalState]

  return (
    // pointerEvents="none" em toda a tela → política Zero-Touch
    <View 
      style={styles.root} 
      pointerEvents="none"
      onLayout={(e) => {
        // Captura dimensões reais do frame para bounding boxes precisas
        const { width, height } = e.nativeEvent.layout
        setFrameDimensions({ width, height })
      }}
    >
      {/* Feed de câmera AR (dashcam) */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        frameProcessorFps={currentFPS}  // FPS adaptativo baseado em thermal state
        photo={false}                   // NUNCA tirar fotos
        video={false}                   // NUNCA gravar vídeo
        audio={false}
        format={'high'}                 // Prioriza qualidade para inferência
      />

      {/* Overlay de bounding box */}
      <BoundingBox
        detection={activeDetection}
        frameWidth={frameDimensions.width}
        frameHeight={frameDimensions.height}
      />

      {/* Alerta crítico full-screen (border pulsante) */}
      {activeDetection?.isCritical && (
        <View style={styles.criticalBorder} pointerEvents="none" />
      )}

      {/* HUD Superior: Status GPS, IA e Thermal */}
      <View style={styles.hudTop} pointerEvents="none">
        <View style={styles.hudChip}>
          <View style={[styles.dot, { backgroundColor: thermalColor }]} />
          <Text style={styles.hudText}>IA {currentFPS} FPS</Text>
        </View>
        <View style={styles.hudChip}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.hudText}>GPS {speedKmh} km/h</Text>
        </View>
        <View style={styles.hudChip}>
          <Text style={[styles.hudText, { color: '#F87171' }]}>● MODO CONDUÇÃO</Text>
        </View>
        {thermalState !== ThermalState.NORMAL && (
          <View style={[styles.hudChip, { borderColor: thermalColor }]}>
            <Text style={[styles.hudText, { color: thermalColor }]}>
              {thermalState === ThermalState.MODERATE ? '🔥 Economia' : '🔥 Crítico'}
            </Text>
          </View>
        )}
      </View>

      {/* HUD Inferior: Tempo de Sessão */}
      <View style={styles.hudBottom} pointerEvents="none">
        <View style={styles.hudChipLarge}>
          <Text style={styles.hudTextLarge}>⏱ {sessionTime}</Text>
        </View>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────
const CORNER_SIZE = 12
const CORNER_WIDTH = 2

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  noCamera: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  noCameraText: {
    color: '#9CA3AF',
    fontSize: 14,
  },

  // ── HUD ────────────────────────────────────────────────
  hudTop: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  hudBottom: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hudChipLarge: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hudText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
  },
  hudTextLarge: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
    letterSpacing: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // ── Bounding Box ───────────────────────────────────────
  bboxContainer: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 2,
  },
  bboxLabel: {
    position: 'absolute',
    top: -20,
    left: -1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  bboxLabelText: {
    color: '#000',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
  },

  // Cantos estilizados da bbox
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderWidth: CORNER_WIDTH,
  },
  cornerTL: { top: -1, left: -1, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 2 },
  cornerTR: { top: -1, right: -1, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 2 },
  cornerBL: { bottom: -1, left: -1, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 2 },
  cornerBR: { bottom: -1, right: -1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 2 },

  // ── Alerta crítico ─────────────────────────────────────
  criticalBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#EF4444',
    borderRadius: 0,
    opacity: 0.7,
  },
})
