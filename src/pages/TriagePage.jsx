import { TriageTableInner } from '../components/triage/TriageTable'
import { useTriageQueue, useUpdateIncidentStatus } from '../hooks/useTriageQueries'

export function TriagePage() {
  const queueQuery = useTriageQueue()
  const updateMutation = useUpdateIncidentStatus()

  if (queueQuery.isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Carregando fila de triagem…</p>
  }

  if (queueQuery.isError) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
        Falha ao carregar fila operacional.
      </p>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Fila de Aprovação</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Selecione um evento para revisar o frame, justificativa da IA e tomar a decisão operacional.
        </p>
      </div>

      <TriageTableInner
        queue={queueQuery.data}
        isUpdating={updateMutation.isPending}
        onDecision={(id, status) => updateMutation.mutate({ id, status })}
      />
    </section>
  )
}
