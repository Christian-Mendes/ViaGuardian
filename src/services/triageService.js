import { http } from '../lib/http'
import { triageQueueMock } from '../mocks/mockData'

export async function getTriageQueue() {
  try {
    const response = await http.get('/triage/queue')
    return response.data
  } catch {
    return triageQueueMock
  }
}

export async function updateIncidentStatus(id, status) {
  try {
    const response = await http.patch(`/triage/incidents/${id}/status`, { status })
    return response.data
  } catch {
    return { id, status, updatedAt: new Date().toISOString() }
  }
}
