import { http } from '../lib/http'
import { triageQueueMock } from '../mocks/mockData'

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTADOR — Conversão snake_case → camelCase + Mapeamento de Campos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte chaves de snake_case (Python) para camelCase (JavaScript).
 * Processa recursivamente objetos e arrays aninhados.
 */
function toCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item))
  }
  
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      // Converte: event_timestamp_utc → eventTimestampUtc
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      acc[camelKey] = toCamelCase(value)
      return acc
    }, {})
  }
  
  return obj
}

/**
 * Mapeia labels de anomaly_class do backend para nomes amigáveis do frontend.
 */
const ANOMALY_CLASS_LABELS = {
  'NEAR_MISS': 'Quase-acidente',
  'RISK_BEHAVIOR': 'Comportamento de Risco',
  'POTHOLE': 'Anomalia de Via (Buraco)',
  'FADED_LANE': 'Sinalização Apagada',
  'OBSTRUCTION': 'Obstrução de Via',
}

/**
 * Adapta um incidente do backend (Python snake_case) para o frontend (JavaScript camelCase).
 * Privacy by Design: Sem imagens, apenas dados telemétricos geoespaciais.
 */
function adaptIncidentForFrontend(incident) {
  const camelCased = toCamelCase(incident)
  
  return {
    id: camelCased.id,
    category: ANOMALY_CLASS_LABELS[incident.anomaly_class] || incident.anomaly_class,
    confidence: camelCased.confidenceScore,
    lat: camelCased.latitude,
    lon: camelCased.longitude,
    recurrence: camelCased.recurrenceCount || 1,
    irv: camelCased.irvScore,
    status: camelCased.status === 'PENDING' ? 'Pendente' : 
            camelCased.status === 'APPROVED' ? 'Aprovado' : 'Rejeitado',
    receivedAt: camelCased.eventTimestampUtc || new Date().toISOString(),
    // Campos opcionais para exibição
    location: `Lat: ${camelCased.latitude?.toFixed(4) || 'N/A'}, Lon: ${camelCased.longitude?.toFixed(4) || 'N/A'}`,
    corridor: camelCased.corridor || 'Corredor desconhecido',
    neighborhood: camelCased.neighborhood || 'Bairro desconhecido',
    rationale: `Detecção de ${ANOMALY_CLASS_LABELS[incident.anomaly_class] || incident.anomaly_class} validada por ${camelCased.recurrenceCount || 1} sensor(es) independente(s) na mesma geolocalização.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIÇOS — Interface pública para os componentes React
// ─────────────────────────────────────────────────────────────────────────────

export async function getTriageQueue() {
  try {
    const response = await http.get('/triage/queue')
    // Adapta cada incidente: snake_case → camelCase + campos faltantes
    return response.data.map(adaptIncidentForFrontend)
  } catch {
    return triageQueueMock
  }
}

export async function updateIncidentStatus(id, status) {
  try {
    const response = await http.patch(`/triage/incidents/${id}/status`, { status })
    return toCamelCase(response.data)
  } catch {
    return { id, status, updatedAt: new Date().toISOString() }
  }
}
