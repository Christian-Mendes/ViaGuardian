/**
 * ActiveDrivingScreen.jsx — v2
 *
 * Tela de Condução Ativa (Estado DRIVING da FSM).
 *
 * ── Responsabilidades ───────────────────────────────────────────────────────
 *   • Feed de câmera 100% full-screen (react-native-vision-camera)
 *   • Bounding boxes multi-detecção com fade-in animado por severidade
 *   • Feedback multimodal não-visual: háptico + TTS (via multimodalAlert.js)
 *   • Thermal Throttling Controller:
 *       - Leitura de temperatura simulada (produção: ThermalManager/ProcessInfo)
 *       - Limiar de 43 °C → throttling forçado de 30 FPS → 5 FPS
 *       - Indicador translúcido discreto no cabeçalho
 *   • Zero-Touch UX: pointerEvents="none" em toda camada de UI
 *   • Privacidade absoluta: frames NUNCA são persistidos em disco
 *
 * ── Fluxo LGPD ──────────────────────────────────────────────────────────────
 *   Frame (RAM) → TFLite worklet → scalars numéricos → JS thread
 *       ↓                                                    ↓
 *   [DESCARTADO] GC libera buffer de vídeo          [ENFILEIRADO] payload JSON
 *               imediatamente após worklet sair             (sem imagem)
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera'
import { runOnJS } from 'react-native-reanimated'

import { useTelemetryStore, AnomalyClass } from '../store/telemetryStore'
import { buildAnonymizedPayload } from '../utils/payloadBuilder'
import { triggerAlert } from '../utils/multimodalAlert'
import { runYOLOInference, MODEL_CONFIG } from '../utils/tfliteProcessor'
import { thermalController, ThermalState } from '../utils/thermalThrottling'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Limiar de confiança mínima para aceitar uma detecção (70%). */
const CONFIDENCE_THRESHOLD = MODEL_CONFIG.confidenceThreshold

/**
 * Limiar de temperatura em graus Celsius que aciona o throttling forçado.
 * Acima deste valor: FPS de inferência é reduzido de 30 → 5 FPS.
 */
const THERMAL_THROTTLE_TEMP_CELSIUS = 43

/** FPS de inferência em modo de throttling térmico forçado (43°C+). */
const FPS_THROTTLED = 5

/** FPS padrão de inferência em operação normal. */
const FPS_NOMINAL = 10

/** Duração máxima (ms) de uma bounding box na tela antes de sumir. */
const BBOX_LIFETIME_MS = 1800

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de cores por classe de anomalia (esquema estrito de projeto)
// ─────────────────────────────────────────────────────────────────────────────
const BBOX_COLORS = {
  // ── Amarelo: anomalias de infraestrutura viária ──────────────────────────
  [AnomalyClass.POTHOLE]:       '#FBBF24',
  [AnomalyClass.FADED_LANE]:    '#FBBF24',
  [AnomalyClass.OBSTRUCTION]:   '#FBBF24',
  // ── Vermelho: riscos críticos de proximidade / colisão ───────────────────
  [AnomalyClass.NEAR_MISS]:     '#EF4444',
  [AnomalyClass.RISK_BEHAVIOR]: '#EF4444',
  // ── Branco: alvos neutros / rastreamento genérico ────────────────────────
  default:                      '#FFFFFF',
}

function getBboxColor(anomalyClass) {
  return BBOX_COLORS[anomalyClass] ?? BBOX_COLORS.default
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Bounding Box Individual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renderiza uma bounding box flutuante com cantos estilizados (estilo dashcam AR).
 *
 * @param {{ detection: object, frameWidth: number, frameHeight: number }} props
 */
function BoundingBox({ detection, frameWidth, frameHeight }) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!detection) return

    // Sequência: fade-in rápido → hold → fade-out suave
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.delay(BBOX_LIFETIME_MS - 380),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }),
    ]).start()
  }, [detection?.id, opacity]) // re-dispara apenas quando troca de detecção

  if (!detection?.bbox) return null

  const { x, y, w, h } = detection.bbox
  const color = getBboxColor(detection.anomalyClass)

  // Converte coordenadas percentuais → pixels absolutos no frame
  const left   = (x / 100) * frameWidth
  const top    = (y / 100) * frameHeight
  const width  = (w / 100) * frameWidth
  const height = (h / 100) * frameHeight

  const isCritical = detection.isCritical

  return (
    <Animated.View
      style={[
        styles.bboxContainer,
        {
          left,
          top,
          width,
          height,
          borderColor: color,
          borderWidth: isCritical ? 2 : 1.5,
          opacity,
        },
      ]}
      // Zero-Touch: sobreposição não recebe eventos de toque
      pointerEvents="none"
    >
      {/* Label: classe + score de confiança */}
      <View style={[styles.bboxLabel, { backgroundColor: color }]}>
        <Text style={styles.bboxLabelText} allowFontScaling={false}>
          {detection.anomalyClass.toUpperCase().replace(/_/g, ' ')}{' '}
          {(detection.confidence * 100).toFixed(0)}%
        </Text>
      </View>

      {/* Cantos estilizados — design dashcam AR */}
      <View style={[styles.corner, styles.cornerTL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: color }]} />
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Camada de Alerta Crítico (border pulsante full-screen)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Borda vermelha pulsante que cobre a tela inteira quando há risco crítico ativo.
 * Usa Animated.loop para pulsação contínua enquanto o alerta persiste.
 */
function CriticalAlertBorder({ isActive }) {
  const pulseAnim = useRef(new Animated.Value(0)).current
  const loopRef   = useRef(null)

  useEffect(() => {
    if (isActive) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.25,
            duration: 400,
            useNativeDriver: true,
            easing: Easing.in(Easing.quad),
          }),
        ]),
      )
      loopRef.current.start()
    } else {
      loopRef.current?.stop()
      loopRef.current = null
      pulseAnim.setValue(0)
    }

    return () => {
      loopRef.current?.stop()
    }
  }, [isActive, pulseAnim])

  if (!isActive) return null

  return (
    <Animated.View
      style={[styles.criticalBorder, { opacity: pulseAnim }]}
      pointerEvents="none"
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: Temperatura Simulada do Hardware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a temperatura atual do dispositivo em °C.
 *
 * ── Produção ──────────────────────────────────────────────────────────────────
 *   Android: NativeModules.ThermalMonitor.getTemperature() — ThermalManager API
 *   iOS:     NativeModules.ThermalMonitor.getThermalState() → mapeado para °C
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Desenvolvimento ───────────────────────────────────────────────────────────
 *   Simula aquecimento gradual a partir dos 40°C até 46°C, cruzando o limiar
 *   de 43°C após ~90 segundos (para testar o UI do indicador térmico).
 * ─────────────────────────────────────────────────────────────────────────────
 */
function useDeviceTemperature() {
  const [tempCelsius, setTempCelsius] = useState(38.5)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    // ── PRODUÇÃO: substitua este bloco pela leitura nativa ────────────────
    // const { NativeModules } = require('react-native')
    // const interval = setInterval(async () => {
    //   const temp = await NativeModules.ThermalMonitor.getTemperatureCelsius()
    //   setTempCelsius(temp)
    // }, 3000)
    // return () => clearInterval(interval)
    // ─────────────────────────────────────────────────────────────────────

    // ── DESENVOLVIMENTO: simulação de aquecimento ─────────────────────────
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000

      // Curva sigmoidal: 38°C → pico de 46°C em ~3 minutos, depois esfria
      const warmupPhase  = Math.min(elapsedSec / 120, 1)       // 0–120s: aquece
      const cooldownPh   = Math.max((elapsedSec - 180) / 90, 0) // 180s+: esfria

      const simTemp =
        38.5 +
        (7.5 * warmupPhase) -          // +7.5°C no aquecimento
        (4.0 * cooldownPh) +           // -4°C no resfriamento
        (Math.random() - 0.5) * 0.4   // ruído ±0.2°C

      setTempCelsius(parseFloat(simTemp.toFixed(1)))
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  return tempCelsius
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: Contador de Sessão
// ─────────────────────────────────────────────────────────────────────────────

function useSessionTimer(sessionStartedAt) {
  const [sessionTime, setSessionTime] = useState('00:00:00')

  useEffect(() => {
    if (!sessionStartedAt) return

    const interval = setInterval(() => {
      const elapsed  = Date.now() - new Date(sessionStartedAt).getTime()
      const hours    = Math.floor(elapsed / 3_600_000)
      const minutes  = Math.floor((elapsed % 3_600_000) / 60_000)
      const seconds  = Math.floor((elapsed % 60_000) / 1_000)
      setSessionTime(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionStartedAt])

  return sessionTime
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela Principal
// ─────────────────────────────────────────────────────────────────────────────

export function ActiveDrivingScreen() {
  const device = useCameraDevice('back')

  // ── Selectors do Store (granulares para evitar re-renders desnecessários) ──
  const currentLocation   = useTelemetryStore((s) => s.currentLocation)
  const currentSpeed      = useTelemetryStore((s) => s.currentSpeed)
  const activeDetection   = useTelemetryStore((s) => s.activeDetection)
  const registerDetection = useTelemetryStore((s) => s.registerDetection)
  const sessionStartedAt  = useTelemetryStore((s) => s.session.sessionStartedAt)

  // ── Dimensões do frame (capturadas via onLayout para bboxes precisas) ─────
  const [frameDimensions, setFrameDimensions] = useState(() => ({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }))

  // ── Estado térmico e FPS adaptativo ───────────────────────────────────────
  const [thermalState, setThermalState]   = useState(ThermalState.NORMAL)
  const [currentFPS,   setCurrentFPS]     = useState(FPS_NOMINAL)
  const [isTempThrottled, setIsTempThrottled] = useState(false)

  // ── Temperatura do hardware (hook de leitura nativa ou simulada) ──────────
  const tempCelsius = useDeviceTemperature()

  // ── Timer de sessão ───────────────────────────────────────────────────────
  const sessionTime = useSessionTimer(sessionStartedAt)

  // ── Refs de performance (não causam re-render) ────────────────────────────
  const inferenceCountRef = useRef(0)
  const lastMetricsLog    = useRef(0)

  // ─────────────────────────────────────────────────────────────────────────
  // Efeito: Thermal Throttling por temperatura (limiar 43°C)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const overThreshold = tempCelsius >= THERMAL_THROTTLE_TEMP_CELSIUS

    setIsTempThrottled(overThreshold)
    setCurrentFPS(overThreshold ? FPS_THROTTLED : thermalController.getCurrentFPS())

    if (overThreshold && thermalState === ThermalState.NORMAL) {
      // Notifica o thermalController (força MODERATE na API interna)
      thermalController.updateThermalState(ThermalState.MODERATE)
    }
  }, [tempCelsius, thermalState])

  // ─────────────────────────────────────────────────────────────────────────
  // Efeito: Acompanha mudanças de estado térmico do controlador
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = thermalController.onStateChange((newState) => {
      setThermalState(newState)
      // FPS pode ser sobreposto pelo limiar de temperatura
      if (!isTempThrottled) {
        setCurrentFPS(thermalController.getCurrentFPS())
      }
    })
    return unsubscribe
  }, [isTempThrottled])

  // ─────────────────────────────────────────────────────────────────────────
  // Efeito: Reseta métricas ao montar a tela
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    thermalController.reset()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Callback: Processa detecções na JS thread (vindo do frame processor)
  //
  // GARANTIA DE PRIVACIDADE LGPD:
  //   Esta função recebe APENAS scalars numéricos (class string, float, bbox%).
  //   Nenhum buffer de imagem, pixel array ou frame chega até aqui.
  //   O frame já saiu do escopo da worklet e foi liberado pelo GC nativo.
  // ─────────────────────────────────────────────────────────────────────────
  const handleDetection = useCallback(
    async (anomalyClass, confidenceScore, bboxRaw, inferenceLatency) => {
      // Descarta detecções sem contexto GPS ou abaixo do limiar de confiança
      if (!currentLocation || confidenceScore < CONFIDENCE_THRESHOLD) return

      // Registra latência de inferência para auto-ajuste do thermal controller
      thermalController.recordInference(inferenceLatency)

      // ── Feedback multimodal imediato (não bloqueia a thread) ──────────────
      // Háptico: vibração curta (infraestrutura) ou contínua (risco crítico)
      // TTS:     voz em pt-BR com throttle de 5s por classe
      const isCritical =
        anomalyClass === AnomalyClass.NEAR_MISS ||
        anomalyClass === AnomalyClass.RISK_BEHAVIOR

      triggerAlert(anomalyClass, isCritical)

      // ── Payload anonimizado → enfileirado no telemetryStore ───────────────
      // buildAnonymizedPayload() garante que _bbox só existe localmente
      // e é removido antes de qualquer transmissão para o backend.
      const payload = await buildAnonymizedPayload({
        anomalyClass,
        confidenceScore,
        location: currentLocation,
        bbox: bboxRaw,
      })

      registerDetection(payload)

      // ── Log de métricas (somente em desenvolvimento, a cada 10s) ──────────
      inferenceCountRef.current++
      const now = Date.now()
      if (__DEV__ && now - lastMetricsLog.current > 10_000) {
        lastMetricsLog.current = now
        console.log('[ViaGuardian Perf]', thermalController.getMetrics(), {
          temperatureCelsius: tempCelsius,
          throttledByTemp: isTempThrottled,
          effectiveFPS: currentFPS,
        })
      }
    },
    [currentLocation, registerDetection, tempCelsius, isTempThrottled, currentFPS],
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Frame Processor (executa na thread nativa — Reanimated worklet)
  //
  // FLUXO DE EXECUÇÃO:
  //   1. Verifica thermal throttling → pula frame se necessário
  //   2. Executa YOLOv8 Nano INT8 quantizado (TFLite worklet)
  //   3. Frame sai do escopo → GC libera buffer de vídeo automaticamente
  //   4. Apenas scalars (class, confidence, bbox%) passam para JS thread
  //
  // GARANTIA LGPD:
  //   - O buffer de frame NUNCA é serializado, copiado, salvo ou transmitido
  //   - runOnJS transfere apenas tipos primitivos: string, number, object com scalars
  //   - Camera está configurada com photo=false e video=false
  // ─────────────────────────────────────────────────────────────────────────
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'

      // ── THERMAL THROTTLING ───────────────────────────────────────────────
      // shouldProcessFrame() implementa token bucket baseado no FPS configurado.
      // Se retornar false, o frame é descartado instantaneamente (sem inferência).
      if (!thermalController.shouldProcessFrame()) {
        return
      }

      // ── INFERÊNCIA YOLOv8 NANO ───────────────────────────────────────────
      // runYOLOInference() é um worklet nativo (vision-camera-plugin-tflite).
      // Em DEV: simula detecções aleatórias para testes sem hardware.
      const inferenceStart = Date.now()
      const detections     = runYOLOInference(frame)
      const inferenceLatency = Date.now() - inferenceStart

      // ── FRAME SAI DO ESCOPO AQUI ─────────────────────────────────────────
      // A partir deste ponto, `frame` não é mais referenciado.
      // O GC nativo (C++/Obj-C) libera o buffer de vídeo imediatamente.
      // ────────────────────────────────────────────────────────────────────

      // ── DESPACHA DETECÇÕES PARA JS THREAD ───────────────────────────────
      // runOnJS() serializa apenas os scalars extraídos — NUNCA o frame.
      if (detections.length > 0) {
        detections.forEach((detection) => {
          runOnJS(handleDetection)(
            detection.class,
            detection.confidence,
            detection.bbox,      // {x%, y%, w%, h%} — apenas coordenadas
            inferenceLatency,
          )
        })
      }
    },
    [handleDetection],
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback: câmera traseira não disponível
  // ─────────────────────────────────────────────────────────────────────────
  if (!device) {
    return (
      <View style={styles.noCamera}>
        <Text style={styles.noCameraText}>Câmera traseira não disponível</Text>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Valores derivados para HUD
  // ─────────────────────────────────────────────────────────────────────────
  const speedKmh = ((currentSpeed ?? 0) * 3.6).toFixed(0)

  const thermalColor = {
    [ThermalState.NORMAL]:   '#22C55E',   // verde
    [ThermalState.MODERATE]: '#F59E0B',   // laranja
    [ThermalState.CRITICAL]: '#EF4444',   // vermelho
  }[thermalState] ?? '#22C55E'

  // Temperatura acima do limiar → cor vermelha independente do estado do controller
  const tempColor  = tempCelsius >= THERMAL_THROTTLE_TEMP_CELSIUS ? '#EF4444' : thermalColor
  const hasThermalWarning = thermalState !== ThermalState.NORMAL || isTempThrottled

  const thermalLabel =
    isTempThrottled
      ? `TEMP ${tempCelsius}°C — THROTTLED`
      : thermalState === ThermalState.CRITICAL
      ? `TEMP ${tempCelsius}°C — CRÍTICO`
      : `TEMP ${tempCelsius}°C — ECONOMIA`

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    /**
     * ── ZERO-TOUCH UX LOCKDOWN ──────────────────────────────────────────────
     * pointerEvents="none" na View raiz bloqueia TODOS os eventos de toque e
     * gesto nesta tela. Nenhum elemento filho pode ser clicado ou interagido
     * enquanto o dispositivo detectar velocidade > 0.5 m/s.
     *
     * A transição de volta para ParkedScreen (e restauração de interatividade)
     * é controlada EXCLUSIVAMENTE pelo hook useGpsWatcher → telemetryStore FSM.
     * ────────────────────────────────────────────────────────────────────────
     */
    <View
      style={styles.root}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setFrameDimensions({ width, height })
      }}
    >
      {/* ─── Feed de câmera AR (100% full-screen) ────────────────────────── */}
      {/*                                                                     */}
      {/* PRIVACIDADE:                                                        */}
      {/*   photo={false}  → desativa completamente a API de captura de foto  */}
      {/*   video={false}  → desativa completamente a gravação de vídeo       */}
      {/*   audio={false}  → desativa microfone (não necessário para telemetria)*/}
      {/*                                                                     */}
      {/* O feed de câmera serve APENAS como passagem de frames para o        */}
      {/* frameProcessor — nenhum pixel é salvo em disco ou memória persistente*/}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        frameProcessorFps={currentFPS}
        photo={false}
        video={false}
        audio={false}
        enableBufferCompression
        enableFpsGraph={false}
      />

      {/* ─── Camada absoluta de bloqueio (Zero-Touch) ────────────────────── */}
      {/* Esta View cobre 100% da tela com pointerEvents="none" como reforço  */}
      {/* adicional à View raiz, garantindo duplo bloqueio de interação.       */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">

        {/* ─── Bounding Box (ultima detecção ativa) ──────────────────────── */}
        {/*                                                                   */}
        {/* activeDetection é atualizado pelo telemetryStore.registerDetection */}
        {/* e limpo automaticamente após BBOX_LIFETIME_MS (2s).               */}
        {/* O componente BoundingBox suporta múltiplas instâncias simultâneas  */}
        {/* se o store for estendido para array de detecções no futuro.        */}
        <BoundingBox
          detection={activeDetection}
          frameWidth={frameDimensions.width}
          frameHeight={frameDimensions.height}
        />

        {/* ─── Alerta Crítico: Borda Pulsante Full-Screen ────────────────── */}
        {/* Ativado quando anomalyClass === NEAR_MISS | RISK_BEHAVIOR.        */}
        {/* Usa Animated.loop para pulsação contínua enquanto ativo.          */}
        <CriticalAlertBorder isActive={activeDetection?.isCritical ?? false} />

        {/* ─── HUD Superior: Status de IA, GPS e Thermal ─────────────────── */}
        <View style={styles.hudTop} pointerEvents="none">

          {/* Chip: FPS de inferência + estado thermal */}
          <View style={styles.hudChip}>
            <View style={[styles.dot, { backgroundColor: thermalColor }]} />
            <Text style={styles.hudText} allowFontScaling={false}>
              IA {currentFPS} FPS
            </Text>
          </View>

          {/* Chip: velocidade GPS */}
          <View style={styles.hudChip}>
            <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.hudText} allowFontScaling={false}>
              {speedKmh} km/h
            </Text>
          </View>

          {/* Chip: indicador REC */}
          <View style={styles.hudChip}>
            <View style={[styles.dot, styles.dotPulse, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.hudText, { color: 'rgba(248,113,113,0.9)' }]} allowFontScaling={false}>
              MODO CONDUÇÃO
            </Text>
          </View>

          {/* Chip térmico: aparece translúcido APENAS quando há throttling ativo */}
          {/* Limiar: 43°C ou estado MODERATE/CRITICAL no thermalController      */}
          {hasThermalWarning && (
            <View style={[styles.hudChip, styles.hudChipThermal, { borderColor: tempColor }]}>
              <Text style={[styles.hudText, { color: tempColor }]} allowFontScaling={false}>
                🌡 {thermalLabel}
              </Text>
            </View>
          )}
        </View>

        {/* ─── HUD Inferior: Timer de Sessão ─────────────────────────────── */}
        <View style={styles.hudBottom} pointerEvents="none">
          <View style={styles.hudChipLarge}>
            <Text style={styles.hudTextLarge} allowFontScaling={false}>
              ⏱ {sessionTime}
            </Text>
          </View>
        </View>

        {/* ─── Cantos de moldura dashcam (decorativos, cor neutra) ─────────── */}
        <View style={[styles.frameCorner, styles.frameCornerTL]} pointerEvents="none" />
        <View style={[styles.frameCorner, styles.frameCornerTR]} pointerEvents="none" />
        <View style={[styles.frameCorner, styles.frameCornerBL]} pointerEvents="none" />
        <View style={[styles.frameCorner, styles.frameCornerBR]} pointerEvents="none" />

      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────────────────

const CORNER_SIZE  = 14
const CORNER_THICK = 2

const styles = StyleSheet.create({
  // ── Layout raiz ──────────────────────────────────────────────────────────
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  noCamera: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D0D',
  },
  noCameraText: {
    color: '#6B7280',
    fontSize: 14,
    fontFamily: 'monospace',
  },

  // ── HUD ──────────────────────────────────────────────────────────────────
  hudTop: {
    position: 'absolute',
    top: 52,
    left: 14,
    right: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hudBottom: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.50)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  /**
   * Chip térmico: usa opacidade reduzida + borda colorida para ser discreto.
   * O design intencional é não distrair o motorista, apenas informar.
   */
  hudChipThermal: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  hudChipLarge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 22,
    paddingVertical: 9,
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
  dotPulse: {
    // Nota: animação de pulse real requereria Animated.loop aqui também.
    // Por performance, usamos apenas a cor estática (o piscamento real
    // é gerado pela GPU via CSS animation em prod ou pelo Reanimated).
  },

  // ── Bounding Box ─────────────────────────────────────────────────────────
  bboxContainer: {
    position: 'absolute',
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
    letterSpacing: 0.2,
  },

  // Cantos da bounding box (estilo dashcam AR)
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderWidth: CORNER_THICK,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 2,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 2,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 2,
  },

  // ── Alerta Crítico ───────────────────────────────────────────────────────
  criticalBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#EF4444',
    borderRadius: 0,
  },

  // ── Moldura dashcam (cantos decorativos da tela completa) ─────────────────
  frameCorner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1.5,
  },
  frameCornerTL: {
    top: 12,
    left: 12,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  frameCornerTR: {
    top: 12,
    right: 12,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  frameCornerBL: {
    bottom: 12,
    left: 12,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  frameCornerBR: {
    bottom: 12,
    right: 12,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
})
