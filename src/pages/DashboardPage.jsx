import { HeatmapPanel } from '../components/dashboard/HeatmapPanel'
import { IncidentTrendChart } from '../components/dashboard/IncidentTrendChart'
import { KpiCard } from '../components/dashboard/KpiCard'
import { SeverityDonutChart } from '../components/dashboard/SeverityDonutChart'
import { useDashboardMetrics, useHeatmapData } from '../hooks/useDashboardQueries'

export function DashboardPage() {
  const metricsQuery = useDashboardMetrics()
  const heatmapQuery = useHeatmapData()

  if (metricsQuery.isLoading || heatmapQuery.isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Carregando visão estratégica…</p>
  }

  if (metricsQuery.isError || heatmapQuery.isError) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
        Falha ao carregar dados. Tente novamente em instantes.
      </p>
    )
  }

  const metrics = metricsQuery.data

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="IRV Score"
          value={metrics.irvScore}
          formula="IRV = (Wₐ × D) + (Wₕ × S)"
          note={`+${metrics.trendDelta}% vs semana anterior`}
          accent
        />
        <KpiCard
          title="Incidentes Hoje"
          value={metrics.incidentsToday}
          note="Atualizado há 30 segundos"
        />
        <KpiCard
          title="Corredores de Risco"
          value={metrics.highRiskCorridors}
          note="Prioridade para intervenção"
        />
        <KpiCard
          title="SLA Médio (min)"
          value={`${metrics.responseTimeAvg}`}
          note="Benchmark metropolitano: 8 min"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <HeatmapPanel points={heatmapQuery.data} />
        <SeverityDonutChart data={metrics.severityBreakdown} />
      </section>

      <IncidentTrendChart data={metrics.incidentTrend} />
    </div>
  )
}
