/**
 * telemetryStore.js
 *
 * Gerenciador de estado global (Zustand) da Máquina de Estados Finitos do ViaGuardian.
 *
 * Estados possíveis:
 *   PARKED   → veículo parado, velocidade = 0. UI liberada para interação.
 *   DRIVING  → veículo em movimento. Zero-Touch mode ativo. UI em lockdown.
 *
 * Transição de estado é exclusivamente acionada pelo hook useGpsWatcher,
 * que monitora a velocidade via Geolocation API nativa. Nenhum botão
 * na UI pode alterar o estado diretamente, garantindo a política Zero-Touch.
 */

import { create } from 'zustand'

// ─────────────────────────────────────────────────────────
// Tipos de detecção YOLOv8-Nano (classes treinadas)
// ─────────────────────────────────────────────────────────
export const AnomalyClass = Object.freeze({
  POTHOLE: 'pothole',              // buraco / depressão
  FADED_LANE: 'faded_lane',        // sinalização apagada
  NEAR_MISS: 'near_miss',          // quase-acidente (tangenciamento crítico)
  RISK_BEHAVIOR: 'risk_behavior',  // comportamento de risco
  OBSTRUCTION: 'obstruction',      // obstrução de via
})

// ─────────────────────────────────────────────────────────
// Estado da FSM
// ─────────────────────────────────────────────────────────
export const AppState = Object.freeze({
  PARKED: 'PARKED',
  DRIVING: 'DRIVING',
})

const INITIAL_SESSION = {
  /** Payloads coletados e prontos para upload (nunca contêm imagens) */
  pendingPayloads: [],
  /** Contagem de alertas por categoria nesta sessão */
  alertCounts: {
    [AnomalyClass.POTHOLE]: 0,
    [AnomalyClass.FADED_LANE]: 0,
    [AnomalyClass.NEAR_MISS]: 0,
    [AnomalyClass.RISK_BEHAVIOR]: 0,
    [AnomalyClass.OBSTRUCTION]: 0,
  },
  /** XP acumulado na sessão (gamificação) */
  sessionXp: 0,
  /** Timestamp de início da sessão de condução */
  sessionStartedAt: null,
  /** Distância estimada percorrida (km) */
  distanceKm: 0,
}

export const useTelemetryStore = create((set, get) => ({
  // ── Estado da FSM ──────────────────────────────────────
  appState: AppState.PARKED,

  // ── Dados de GPS atuais ────────────────────────────────
  currentSpeed: 0,        // m/s
  currentLocation: null,  // { latitude, longitude, accuracy }

  // ── Sessão ────────────────────────────────────────────
  session: { ...INITIAL_SESSION },

  // ── Última detecção ativa (para renderizar bounding box) ──
  activeDetection: null,  // { class, confidence, bbox: {x,y,w,h}, isCritical }

  // ── Status de upload ──────────────────────────────────
  uploadStatus: 'idle',   // 'idle' | 'uploading' | 'success' | 'error'
  uploadError: null,

  // ── Ações ─────────────────────────────────────────────

  /**
   * Chamado pelo useGpsWatcher. Aplica a transição da FSM baseada em velocidade.
   * Velocidade abaixo de 0.5 m/s (~2 km/h) é considerada "parado".
   */
  updateLocation: (location) => {
    const { currentSpeed: prevSpeed, appState } = get()
    const newSpeed = location.speed ?? 0
    const isMoving = newSpeed > 0.5

    const nextState = isMoving ? AppState.DRIVING : AppState.PARKED

    // Inicia sessão ao começar a dirigir
    if (nextState === AppState.DRIVING && appState === AppState.PARKED) {
      set((s) => ({
        appState: AppState.DRIVING,
        currentSpeed: newSpeed,
        currentLocation: location,
        session: {
          ...s.session,
          sessionStartedAt: new Date().toISOString(),
        },
      }))
      return
    }

    // Finaliza sessão ao parar
    if (nextState === AppState.PARKED && appState === AppState.DRIVING) {
      set({
        appState: AppState.PARKED,
        currentSpeed: 0,
        currentLocation: location,
        activeDetection: null,
      })
      return
    }

    set({ currentSpeed: newSpeed, currentLocation: location })
  },

  /**
   * Chamado pelo frame processor ao confirmar uma detecção.
   * Acumula o payload anonimizado e atualiza a detecção ativa para render da bounding box.
   * O frame em si NUNCA é passado para esta função — apenas metadados numéricos.
   */
  registerDetection: (payload) => {
    const xpMap = {
      [AnomalyClass.NEAR_MISS]: 50,
      [AnomalyClass.POTHOLE]: 20,
      [AnomalyClass.FADED_LANE]: 15,
      [AnomalyClass.RISK_BEHAVIOR]: 30,
      [AnomalyClass.OBSTRUCTION]: 25,
    }

    const isCritical = payload.anomaly_class === AnomalyClass.NEAR_MISS ||
                       payload.anomaly_class === AnomalyClass.RISK_BEHAVIOR

    set((s) => ({
      activeDetection: {
        anomalyClass: payload.anomaly_class,
        confidence: payload.confidence_score,
        bbox: payload._bbox, // usado apenas para renderização local — não vai no upload
        isCritical,
      },
      session: {
        ...s.session,
        pendingPayloads: [
          ...s.session.pendingPayloads,
          // Remove _bbox antes de enfileirar: nunca sai do dispositivo
          (({ _bbox, ...clean }) => clean)(payload),
        ],
        alertCounts: {
          ...s.session.alertCounts,
          [payload.anomaly_class]: (s.session.alertCounts[payload.anomaly_class] ?? 0) + 1,
        },
        sessionXp: s.session.sessionXp + (xpMap[payload.anomaly_class] ?? 10),
      },
    }))

    // Limpa a detecção ativa após 2s (janela de exibição da bbox)
    setTimeout(() => set({ activeDetection: null }), 2000)
  },

  /** Atualiza status do upload (chamado por ParkedScreen) */
  setUploadStatus: (status, error = null) =>
    set({ uploadStatus: status, uploadError: error }),

  /** Reinicia os dados da sessão após upload bem-sucedido */
  clearSession: () =>
    set({ session: { ...INITIAL_SESSION }, uploadStatus: 'idle', uploadError: null }),
}))
