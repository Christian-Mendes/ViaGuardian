export const dashboardMetricsMock = {
  irvScore: 78.4,
  incidentsToday: 124,
  highRiskCorridors: 9,
  responseTimeAvg: 7.2,
  trendDelta: 5.3,
}

export const heatmapPointsMock = [
  { id: 1, x: 28, y: 36, intensity: 0.95, label: 'Centro' },
  { id: 2, x: 54, y: 48, intensity: 0.78, label: 'Av. Paulista' },
  { id: 3, x: 41, y: 30, intensity: 0.62, label: 'República' },
  { id: 4, x: 18, y: 62, intensity: 0.85, label: 'Bom Retiro' },
  { id: 5, x: 70, y: 70, intensity: 0.55, label: 'Vila Mariana' },
  { id: 6, x: 78, y: 40, intensity: 0.7, label: 'Tatuapé' },
  { id: 7, x: 35, y: 78, intensity: 0.45, label: 'Santo Amaro' },
]

export const incidentTrendMock = [
  { day: 'Seg', incidents: 29, approved: 18 },
  { day: 'Ter', incidents: 35, approved: 24 },
  { day: 'Qua', incidents: 28, approved: 19 },
  { day: 'Qui', incidents: 42, approved: 31 },
  { day: 'Sex', incidents: 38, approved: 27 },
  { day: 'Sab', incidents: 47, approved: 34 },
  { day: 'Dom', incidents: 33, approved: 22 },
]

export const severityBreakdownMock = [
  { name: 'Crítico', value: 23 },
  { name: 'Alto', value: 31 },
  { name: 'Moderado', value: 30 },
  { name: 'Baixo', value: 16 },
]

export const triageQueueMock = [
  {
    id: 'INC-2401',
    category: 'Quase-acidente',
    location: 'Lat: -23.5745, Lon: -46.6890',
    corridor: 'Corredor Norte',
    neighborhood: 'Itaim Bibi',
    confidence: 0.94,
    irv: 84,
    lat: -23.5745,
    lon: -46.6890,
    recurrence: 3,
    receivedAt: '2026-06-01 18:05',
    status: 'Pendente',
    rationale:
      'Detecção de Quase-acidente validada por 3 sensor(es) independente(s) na mesma geolocalização.',
  },
  {
    id: 'INC-2402',
    category: 'Anomalia de Via (Buraco)',
    location: 'Lat: -23.5506, Lon: -46.5772',
    corridor: 'Anel Leste',
    neighborhood: 'Tatuapé',
    confidence: 0.81,
    irv: 71,
    lat: -23.5506,
    lon: -46.5772,
    recurrence: 5,
    receivedAt: '2026-06-01 18:11',
    status: 'Pendente',
    rationale:
      'Detecção de Anomalia de Via (Buraco) validada por 5 sensor(es) independente(s) na mesma geolocalização.',
  },
  {
    id: 'INC-2403',
    category: 'Sinalização Apagada',
    location: 'Lat: -23.6521, Lon: -46.7062',
    corridor: 'Eixo Sul',
    neighborhood: 'Santo Amaro',
    confidence: 0.88,
    irv: 91,
    lat: -23.6521,
    lon: -46.7062,
    recurrence: 7,
    receivedAt: '2026-06-01 18:19',
    status: 'Pendente',
    rationale:
      'Detecção de Sinalização Apagada validada por 7 sensor(es) independente(s) na mesma geolocalização.',
  },
  {
    id: 'INC-2404',
    category: 'Comportamento de Risco',
    location: 'Lat: -23.5617, Lon: -46.6886',
    corridor: 'Marginal Pinheiros',
    neighborhood: 'Pinheiros',
    confidence: 0.72,
    irv: 64,
    lat: -23.5617,
    lon: -46.6886,
    recurrence: 2,
    receivedAt: '2026-06-01 18:27',
    status: 'Pendente',
    rationale:
      'Detecção de Comportamento de Risco validada por 2 sensor(es) independente(s) na mesma geolocalização.',
  },
  {
    id: 'INC-2405',
    category: 'Obstrução de Via',
    location: 'Lat: -23.5880, Lon: -46.6360',
    corridor: 'Eixo Sul',
    neighborhood: 'Vila Olímpia',
    confidence: 0.66,
    irv: 58,
    lat: -23.5880,
    lon: -46.6360,
    recurrence: 1,
    receivedAt: '2026-06-01 18:33',
    status: 'Pendente',
    rationale: 'Detecção de Obstrução de Via validada por 1 sensor(es) independente(s) na mesma geolocalização.',
  },
]

export const cctvFeedsMock = [
  { id: 'CAM-001', location: 'Av. Paulista x Brigadeiro', status: 'online', fps: 28, latency: 42 },
  { id: 'CAM-002', location: 'Marginal Tietê km 11', status: 'online', fps: 30, latency: 38 },
  { id: 'CAM-003', location: 'Av. dos Bandeirantes', status: 'latency', fps: 18, latency: 220 },
  { id: 'CAM-004', location: 'Radial Leste x Bresser', status: 'online', fps: 29, latency: 51 },
  { id: 'CAM-005', location: 'Santo Amaro x João Dias', status: 'offline', fps: 0, latency: 0 },
  { id: 'CAM-006', location: 'Consolação x Maria Antônia', status: 'online', fps: 30, latency: 35 },
]
