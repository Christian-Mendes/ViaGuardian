import { useQuery } from '@tanstack/react-query'
import { getDashboardMetrics, getHeatmapData } from '../services/dashboardService'

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: getDashboardMetrics,
    staleTime: 60_000,
  })
}

export function useHeatmapData() {
  return useQuery({
    queryKey: ['dashboard', 'heatmap'],
    queryFn: getHeatmapData,
    staleTime: 60_000,
  })
}
