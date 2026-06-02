import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTriageQueue, updateIncidentStatus } from '../services/triageService'

export function useTriageQueue() {
  return useQuery({
    queryKey: ['triage', 'queue'],
    queryFn: getTriageQueue,
    staleTime: 20_000,
  })
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }) => updateIncidentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triage', 'queue'] })
    },
  })
}
