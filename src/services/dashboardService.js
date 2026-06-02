import { http } from '../lib/http'
import {
  dashboardMetricsMock,
  heatmapPointsMock,
  incidentTrendMock,
  severityBreakdownMock,
} from '../mocks/mockData'

export async function getDashboardMetrics() {
  try {
    const response = await http.get('/dashboard/metrics')
    return response.data
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
    return response.data
  } catch {
    return heatmapPointsMock
  }
}
