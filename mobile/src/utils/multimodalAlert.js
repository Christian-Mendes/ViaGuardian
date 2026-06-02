/**
 * multimodalAlert.js
 *
 * Feedback multimodal para alertas de perigo durante condução.
 * Estratégia: o motorista NÃO deve precisar olhar para a tela.
 *
 * Canais:
 *   1. Vibração Háptica  — padrão distinto por severidade
 *   2. TTS (Text-to-Speech) — síntese de voz em português
 *
 * Nenhuma notificação push ou push visual intrusiva é usada durante
 * condução ativa (política Zero-Touch).
 */

import { Platform } from 'react-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import Tts from 'react-native-tts'

// ─────────────────────────────────────────────────────────
// Inicialização do TTS (executar uma vez no boot do app)
// ─────────────────────────────────────────────────────────

let _ttsReady = false

export async function initTts() {
  try {
    await Tts.setDefaultLanguage('pt-BR')
    await Tts.setDefaultRate(0.52)   // velocidade natural para alertas
    await Tts.setDefaultPitch(1.05)
    _ttsReady = true
  } catch (e) {
    console.warn('[ViaGuardian TTS] Falha na inicialização:', e)
  }
}

// ─────────────────────────────────────────────────────────
// Perfis de Haptic por Severidade
// ─────────────────────────────────────────────────────────

const HAPTIC_OPTIONS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }

/**
 * Padrão de vibração para risco CRÍTICO (NEAR_MISS / RISK_BEHAVIOR).
 * Sequência: longo–curto–curto (padrão SOS adaptado).
 */
function triggerCriticalHaptic() {
  if (Platform.OS === 'android') {
    // Android: padrão personalizado via VibrationPattern
    // [delay, vibrar, pausa, vibrar, pausa, vibrar]
    const { Vibration } = require('react-native')
    Vibration.vibrate([0, 400, 100, 150, 100, 150])
  } else {
    // iOS: feedback de notificação de erro (mais intenso)
    ReactNativeHapticFeedback.trigger('notificationError', HAPTIC_OPTIONS)
    setTimeout(() => ReactNativeHapticFeedback.trigger('notificationWarning', HAPTIC_OPTIONS), 350)
  }
}

/**
 * Padrão de vibração para anomalia de INFRAESTRUTURA (buraco, sinalização).
 * Sequência: pulso único moderado.
 */
function triggerWarningHaptic() {
  if (Platform.OS === 'android') {
    const { Vibration } = require('react-native')
    Vibration.vibrate(200)
  } else {
    ReactNativeHapticFeedback.trigger('notificationWarning', HAPTIC_OPTIONS)
  }
}

// ─────────────────────────────────────────────────────────
// Mensagens de Voz por Classe de Anomalia
// ─────────────────────────────────────────────────────────

const TTS_MESSAGES = {
  near_miss:      'Atenção! Veículo próximo detectado. Reduza a velocidade.',
  risk_behavior:  'Atenção! Comportamento de risco identificado à frente.',
  pothole:        'Anomalia na via detectada.',
  faded_lane:     'Sinalização comprometida à frente.',
  obstruction:    'Obstrução na pista detectada.',
}

// Throttle: evita TTS repetitivo para a mesma classe em <5s
const _lastSpokenAt = {}
const TTS_THROTTLE_MS = 5000

function shouldSpeak(anomalyClass) {
  const now = Date.now()
  if (!_lastSpokenAt[anomalyClass] || now - _lastSpokenAt[anomalyClass] > TTS_THROTTLE_MS) {
    _lastSpokenAt[anomalyClass] = now
    return true
  }
  return false
}

// ─────────────────────────────────────────────────────────
// API Pública
// ─────────────────────────────────────────────────────────

/**
 * Dispara alerta multimodal (háptico + TTS) para uma detecção.
 *
 * @param {string}  anomalyClass - Classe da anomalia (AnomalyClass enum)
 * @param {boolean} isCritical   - Se true, usa padrão háptico de emergência
 */
export function triggerAlert(anomalyClass, isCritical = false) {
  // Háptico imediato (não bloqueia a thread de inferência)
  if (isCritical) {
    triggerCriticalHaptic()
  } else {
    triggerWarningHaptic()
  }

  // TTS com throttle
  if (_ttsReady && shouldSpeak(anomalyClass)) {
    const message = TTS_MESSAGES[anomalyClass] ?? 'Anomalia detectada.'
    Tts.stop()       // cancela fala anterior se ainda em curso
    Tts.speak(message)
  }
}
