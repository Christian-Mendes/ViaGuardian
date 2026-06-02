/**
 * ActiveDrivingScreen.jsx
 *
 * Tela de Condução Ativa — Estado DRIVING da FSM.
 *
 * Responsabilidades:
 *   • Renderizar o feed de câmera em tempo real (AR pass-through)
 *   • Executar frame processors TFLite para inferência YOLOv8-Nano
 *   • Sobrepor bounding boxes SVG/Animated sobre anomalias detectadas
 *   • Disparar alertas multimodais (háptico + TTS)
 *   • Manter ZERO event listeners de UI ativos (Zero-Touch policy)
 *
 * ─── Fluxo de Privacidade ──────────────────────────────────────────────
 *   Frame (RAM) → TFLite inference → detectionsArray → buildPayload()
 *       ↓                                                    ↓
 *   [DESCARTADO] frame sai do escopo imediatamente    [ENFILEIRADO] apenas metadados JSON
 * ──────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View, Text, Animated } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera'
import { runOnJS } from 'react-native-reanimated'

import { useTelemetryStore, AnomalyClass } from '../store/telemetryStore'
import { buildAnonymizedPayload } from '../utils/payloadBuilder'
import { triggerAlert } from '../utils/multimodalAlert'

// ─────────────────────────────────────────────────────────
// Limiar mínimo de confiança para aceitar uma detecção.
// Abaixo disto, o frame é descartado sem registro.
// ─────────────────────────────────────────────────────────
const CONFIDENCE_THRESHOLD = 0.62

// ─────────────────────────────────────────────────────────
// Mapeamento de classe → cor da bounding box
// Amarelo para infraestrutura, Vermelho para risco crítico
// ─────────────────────────────────────────────────────────
const BBOX_COLORS = {
  [AnomalyClass.POTHOLE]:       '#FBBF24', // âmbar
  [AnomalyClass.FADED_LANE]:    '#FBBF24',
  [AnomalyClass.OBSTRUCTION]:   '#FBBF24',
  [AnomalyClass.NEAR_MISS]:     '#EF4444', // vermelho crítico
  [AnomalyClass.RISK_BEHAVIOR]: '#EF4444',
}

// ─────────────────────────────────────────────────────────
// Componente de Bounding Box sobreposta (AR overlay)
// ─────────────────────────────────────────────────────────
function BoundingBox({ detection, frameWidth, frameHeight }) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!detection) return
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [detection, opacity])

  if (!detection?.bbox) return null

  const { x, y, w, h } = detection.bbox
  const color = BBOX_COLORS[detection.anomalyClass] ?? '#FBBF24'

  const left   = (x / 100) * frameWidth
  const top    = (y / 100) * frameHeight
  const width  = (w / 100) * frameWidth
  const height = (h / 100) * frameHeight

  return (
    <Animated.View
      style={[styles.bboxContainer, { left, top, width, height, borderColor: color, opacity }]}
      pointerEvents="none"
    >
      {/* label classe + confiança */}
      <View style={[styles.bboxLabel, { backgroundColor: color }]}>
        <Text style={styles.bboxLabelText}>
          {detection.anomalyClass} {(detection.confidence * 100).toFixed(0)}%
        </Text>
      </View>
      {/* cantos estilizados */}
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

  // Dimensões do frame (obtidas em runtime na produção via layout event)
  const FRAME_W = 390
  const FRAME_H = 844

  /**
   * Callback executado na JS thread após a inferência.
   * Recebe APENAS metadados — jamais o frame em si.
   */
  const handleDetection = useCallback(
    async (anomalyClass, confidenceScore, bboxRaw) => {
      if (!currentLocation || confidenceScore < CONFIDENCE_THRESHOLD) return

      // Dispara feedback multimodal imediatamente
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
    },
    [currentLocation, registerDetection],
  )

  /**
   * Frame Processor — executa na thread nativa (Worklet).
   *
   * FLUXO LGPD:
   *   1. Frame chega na memória volátil
   *   2. TFLite executa inferência síncronamente no buffer
   *   3. Buffer é descartado (sai do escopo da worklet)
   *   4. Apenas o array de detecções (números puros) é passado para JS
   *
   * Em produção, substitua o mock abaixo pelo plugin TFLite real:
   *   const detections = runModel(frame)   // via vision-camera-plugin-tflite
   */
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'

      // ── PRODUÇÃO ────────────────────────────────────────────────────────
      // const detections = runTFLiteModel(frame)  // plugin nativo TFLite
      // Frame sai do escopo aqui → GC destrói o buffer de vídeo
      // ────────────────────────────────────────────────────────────────────

      // ── SIMULAÇÃO (desenvolvimento / testes) ────────────────────────────
      // Gera uma detecção aleatória com baixa frequência para simular o modelo
      if (Math.random() > 0.97) {
        const classes = Object.values(AnomalyClass)
        const randomClass = classes[Math.floor(Math.random() * classes.length)]
        const confidence = 0.62 + Math.random() * 0.35

        // Bounding box simulada (coordenadas em % do frame)
        const bbox = {
          x: 20 + Math.random() * 40,
          y: 20 + Math.random() * 40,
          w: 15 + Math.random() * 25,
          h: 12 + Math.random() * 20,
        }

        // Passa APENAS escalares para a JS thread (não o frame)
        runOnJS(handleDetection)(randomClass, confidence, bbox)
      }
      // ────────────────────────────────────────────────────────────────────
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

  return (
    // pointerEvents="none" em toda a tela → política Zero-Touch
    <View style={styles.root} pointerEvents="none">
      {/* Feed de câmera AR */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        frameProcessorFps={10}  // 10fps de inferência (equilibrio performance/bateria)
        photo={false}           // NUNCA tirar fotos
        video={false}           // NUNCA gravar vídeo
        audio={false}
      />

      {/* Overlay de bounding box */}
      <BoundingBox
        detection={activeDetection}
        frameWidth={FRAME_W}
        frameHeight={FRAME_H}
      />

      {/* Alerta crítico full-screen (border pulsante) */}
      {activeDetection?.isCritical && (
        <View style={styles.criticalBorder} pointerEvents="none" />
      )}

      {/* HUD: indicadores mínimos translúcidos */}
      <View style={styles.hud} pointerEvents="none">
        <View style={styles.hudChip}>
          <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.hudText}>IA Ativa</Text>
        </View>
        <View style={styles.hudChip}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.hudText}>GPS {speedKmh} km/h</Text>
        </View>
        <View style={styles.hudChip}>
          <Text style={[styles.hudText, { color: '#F87171' }]}>● MODO CONDUÇÃO</Text>
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
  hud: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
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
  hudText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
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
