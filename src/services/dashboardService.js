import { http } from '../lib/http'
import {
  dashboardMetricsMock,
  heatmapPointsMock,
  incidentTrendMock,
  severityBreakdownMock,
} from '../mocks/mockData'

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTADORES — Camada de conversão entre Backend (Python) e Frontend (React)
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
      // Converte: severity_breakdown → severityBreakdown
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      acc[camelKey] = toCamelCase(value)
      return acc
    }, {})
  }
  
  return obj
}

/**
 * Converte coordenadas GPS (lat/lon) do backend Python para coordenadas SVG (x/y).
 * 
 * Mapeamento da área metropolitana de São Paulo:
 *   Latitude:  -23.7 (sul) até -23.4 (norte)   →  y: 0-100% (invertido: norte é y=0)
 *   Longitude: -46.8 (oeste) até -46.4 (leste) →  x: 0-100%
 */
function gpsToSvgCoordinates(lat, lon) {
  // Limites geográficos de São Paulo (área metropolitana)
  const LAT_MIN = -23.7  // Sul (y=100)
  const LAT_MAX = -23.4  // Norte (y=0)
  const LON_MIN = -46.8  // Oeste (x=0)
  const LON_MAX = -46.4  // Leste (x=100)
  
  // Normaliza latitude para Y (invertido: quanto mais ao norte, menor o Y)
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100
  
  // Normaliza longitude para X (quanto mais a leste, maior o X)
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100
  
  // Garante que coordenadas fiquem dentro do viewBox [0, 100]
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIÇOS — Interface pública para os componentes React
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardMetrics() {
  try {
    const response = await http.get('/dashboard/metrics')
    // Converte snake_case do Python para camelCase do JavaScript
    return toCamelCase(response.data)
  } catch {
    return {
      ...dashboardMetricsMock,
      incidentTrend: incidentTrendMock,
      severityBreakdown: severityBreakdownMock,
    }
  }
}

export async function getHeatmapData() {
  try {
    const response = await http.get('/dashboard/heatmap')
    const points = response.data
    
    // Backend retorna lat/lon reais - mantém para Leaflet, mas também calcula x/y para SVG
    return points.map(point => {
      const { x, y } = gpsToSvgCoordinates(point.lat, point.lon)
      
      return {
        id: point.id,
        lat: point.lat,        // Mantém coordenadas GPS originais para Leaflet
        lon: point.lon,
        x: Math.round(x),      // Coordenadas SVG (caso precise)
        y: Math.round(y),
        intensity: point.intensity,
        label: point.label
      }
    })
  } catch {
    // Mocks de fallback com coordenadas reais de São Paulo
    return [
      { id: 1, lat: -23.5505, lon: -46.6333, x: 28, y: 36, intensity: 0.95, label: 'Centro' },
      { id: 2, lat: -23.5617, lon: -46.6560, x: 54, y: 48, intensity: 0.78, label: 'Av. Paulista' },
      { id: 3, lat: -23.5432, lon: -46.6425, x: 41, y: 30, intensity: 0.62, label: 'República' },
      { id: 4, lat: -23.5268, lon: -46.6226, x: 18, y: 62, intensity: 0.85, label: 'Bom Retiro' },
      { id: 5, lat: -23.5880, lon: -46.6360, x: 70, y: 70, intensity: 0.55, label: 'Vila Mariana' },
      { id: 6, lat: -23.5506, lon: -46.5772, x: 78, y: 40, intensity: 0.7, label: 'Tatuapé' },
      { id: 7, lat: -23.6521, lon: -46.7062, x: 35, y: 78, intensity: 0.45, label: 'Santo Amaro' },
    ]
  }
}
