/**
 * thermalThrottling.js
 *
 * Controlador Adaptativo de Performance (Thermal Throttling).
 * 
 * Monitora continuamente a saúde térmica e energética do dispositivo,
 * ajustando dinamicamente a taxa de amostragem do frame processor
 * para evitar aquecimento excessivo e prolongar a vida da bateria.
 * 
 * ╔══════════════════════════════════════════════════════════╗
 * ║  ESTRATÉGIA DE ADAPTAÇÃO                                ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Estado NORMAL    → 10 FPS (inferência a cada 100ms)    ║
 * ║  Estado MODERATE  → 5 FPS  (inferência a cada 200ms)    ║
 * ║  Estado CRITICAL  → 2 FPS  (inferência a cada 500ms)    ║
 * ╚══════════════════════════════════════════════════════════╝
 * 
 * A throttling é transparente para o usuário: a câmera continua
 * renderizando a 30 FPS, mas a inferência do modelo é amostrada.
 */

import { Platform } from 'react-native'

// ─────────────────────────────────────────────────────────
// Estados Térmicos
// ─────────────────────────────────────────────────────────

export const ThermalState = Object.freeze({
  NORMAL: 'normal',       // Dispositivo frio, performance máxima
  MODERATE: 'moderate',   // Aquecimento detectado, reduzir carga
  CRITICAL: 'critical',   // Superaquecimento, mínimo de processamento
})

// ─────────────────────────────────────────────────────────
// Perfis de FPS por Estado Térmico
// ─────────────────────────────────────────────────────────

const FPS_PROFILES = {
  [ThermalState.NORMAL]: {
    fps: 10,
    intervalMs: 100,
    description: 'Performance total - inferência otimizada',
  },
  [ThermalState.MODERATE]: {
    fps: 5,
    intervalMs: 200,
    description: 'Economia de energia - redução moderada',
  },
  [ThermalState.CRITICAL]: {
    fps: 2,
    intervalMs: 500,
    description: 'Modo de sobrevivência - mínimo de processamento',
  },
}

// ─────────────────────────────────────────────────────────
// Classe do Controlador
// ─────────────────────────────────────────────────────────

class ThermalThrottlingController {
  constructor() {
    this.currentState = ThermalState.NORMAL
    this.lastInferenceTime = 0
    this.frameCount = 0
    this.skipCount = 0
    this.listeners = []

    // Métricas de performance
    this.avgInferenceLatency = 0
    this.maxInferenceLatency = 0
    this.totalInferences = 0

    // Inicializa monitoramento (produção: usar APIs nativas)
    this._startThermalMonitoring()
  }

  /**
   * Verifica se o frame atual deve ser processado ou pulado,
   * baseado no estado térmico e timing.
   * 
   * @returns {boolean} true se deve processar, false para pular
   */
  shouldProcessFrame() {
    const now = Date.now()
    const profile = FPS_PROFILES[this.currentState]
    const elapsed = now - this.lastInferenceTime

    this.frameCount++

    if (elapsed >= profile.intervalMs) {
      this.lastInferenceTime = now
      return true
    }

    this.skipCount++
    return false
  }

  /**
   * Registra o tempo de uma inferência para cálculo de métricas.
   * 
   * @param {number} latencyMs - Tempo de inferência em milissegundos
   */
  recordInference(latencyMs) {
    this.totalInferences++
    this.avgInferenceLatency = 
      (this.avgInferenceLatency * (this.totalInferences - 1) + latencyMs) / this.totalInferences
    
    if (latencyMs > this.maxInferenceLatency) {
      this.maxInferenceLatency = latencyMs
    }

    // Auto-ajuste: se latência média > 100ms, reduz FPS automaticamente
    if (this.avgInferenceLatency > 100 && this.currentState === ThermalState.NORMAL) {
      this._updateThermalState(ThermalState.MODERATE)
    }
  }

  /**
   * Atualiza o estado térmico e notifica listeners.
   * Alias público: updateThermalState() — use este a partir de contextos externos,
   * como o hook useDeviceTemperature do ActiveDrivingScreen.
   *
   * @param {string} newState - Novo estado térmico (ThermalState enum)
   */
  updateThermalState(newState) {
    this._updateThermalState(newState)
  }

  _updateThermalState(newState) {
    if (this.currentState === newState) return

    const oldState = this.currentState
    this.currentState = newState

    console.log(`[ThermalThrottling] ${oldState} → ${newState}`, {
      fps: FPS_PROFILES[newState].fps,
      avgLatency: this.avgInferenceLatency.toFixed(1),
    })

    // Notifica listeners
    this.listeners.forEach(callback => callback(newState, oldState))
  }

  /**
   * Registra um listener para mudanças de estado térmico.
   * 
   * @param {Function} callback - (newState, oldState) => void
   * @returns {Function} Função para remover o listener
   */
  onStateChange(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  /**
   * Inicia o monitoramento térmico nativo.
   * 
   * Em produção, integre com:
   *   - Android: ThermalManager API
   *   - iOS: ProcessInfo.thermalState
   */
  _startThermalMonitoring() {
    // ── PRODUÇÃO ────────────────────────────────────────────────────
    // 
    // import { NativeModules } from 'react-native'
    // const { ThermalMonitor } = NativeModules
    // 
    // ThermalMonitor.addEventListener('thermalStateChanged', (event) => {
    //   const { thermalState } = event
    //   
    //   if (thermalState === 'serious' || thermalState === 'critical') {
    //     this._updateThermalState(ThermalState.CRITICAL)
    //   } else if (thermalState === 'fair') {
    //     this._updateThermalState(ThermalState.MODERATE)
    //   } else {
    //     this._updateThermalState(ThermalState.NORMAL)
    //   }
    // })
    // ────────────────────────────────────────────────────────────────

    // ── DESENVOLVIMENTO: Simulação de Monitoramento ─────────────────
    // 
    // Simula mudanças térmicas aleatórias para testes.
    // Em produção, REMOVA este bloco.
    // ────────────────────────────────────────────────────────────────

    if (__DEV__) {
      // Simula transição para MODERATE após 2 minutos
      setTimeout(() => {
        if (this.currentState === ThermalState.NORMAL) {
          this._updateThermalState(ThermalState.MODERATE)
        }
      }, 120_000)

      // Simula retorno ao NORMAL após 5 minutos
      setTimeout(() => {
        if (this.currentState === ThermalState.MODERATE) {
          this._updateThermalState(ThermalState.NORMAL)
        }
      }, 300_000)
    }
  }

  /**
   * Retorna o FPS atual configurado.
   */
  getCurrentFPS() {
    return FPS_PROFILES[this.currentState].fps
  }

  /**
   * Retorna métricas de performance.
   */
  getMetrics() {
    return {
      thermalState: this.currentState,
      currentFPS: FPS_PROFILES[this.currentState].fps,
      frameCount: this.frameCount,
      skipCount: this.skipCount,
      totalInferences: this.totalInferences,
      avgInferenceLatency: parseFloat(this.avgInferenceLatency.toFixed(2)),
      maxInferenceLatency: this.maxInferenceLatency,
      processingRate: ((this.totalInferences / this.frameCount) * 100).toFixed(1) + '%',
    }
  }

  /**
   * Reseta as métricas (útil ao iniciar nova sessão).
   */
  reset() {
    this.frameCount = 0
    this.skipCount = 0
    this.totalInferences = 0
    this.avgInferenceLatency = 0
    this.maxInferenceLatency = 0
    this.lastInferenceTime = 0
  }
}

// ─────────────────────────────────────────────────────────
// Singleton Global
// ─────────────────────────────────────────────────────────

export const thermalController = new ThermalThrottlingController()
