import { useState } from 'react'

function confidenceColor(v) {
  if (v >= 0.85) return 'bg-blue-600'
  if (v >= 0.7) return 'bg-amber-500'
  return 'bg-rose-500'
}

function StatusBadge({ status }) {
  const map = {
    Pendente:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
    Aprovado:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
    Rejeitado:
      'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800',
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${map[status] ?? map.Pendente}`}>
      {status}
    </span>
  )
}

function DetailPanel({ item, onDecision, isUpdating }) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-900/40">
        <svg
          className="h-10 w-10 text-gray-300 dark:text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
          />
        </svg>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Selecione um evento na tabela para revisar detalhes e tomar decisão.
        </p>
      </div>
    )
  }

  const bbox = item.bbox

  return (
    <div className="flex h-full flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-gray-400">{item.id}</p>
          <h4 className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{item.category}</h4>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* frame simulado com bounding box */}
      <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-900">
        <div className="absolute inset-0 opacity-10">
          {[15, 30, 45, 60, 75, 90].map((y) => (
            <div
              key={y}
              className="absolute w-full border-t border-emerald-400/40"
              style={{ top: `${y}%` }}
            />
          ))}
        </div>
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
          <span className="font-mono text-[9px] text-white/60">ANOMALIA DETECTADA</span>
        </div>

        {/* bounding box */}
        <div
          className="absolute rounded border-2 border-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"
          style={{
            left: `${bbox.x}%`,
            top: `${bbox.y}%`,
            width: `${bbox.w}%`,
            height: `${bbox.h}%`,
          }}
        >
          <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-blue-500 px-1.5 py-0.5 font-mono text-[9px] text-white">
            {bbox.label}
          </span>
        </div>

        <div className="absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-emerald-400/50" />
        <div className="absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-emerald-400/50" />
        <div className="absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-emerald-400/50" />
        <div className="absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-emerald-400/50" />

        <div className="absolute bottom-2 left-2 right-2 flex justify-between font-mono text-[9px] text-white/50">
          <span>YOLOv8-Nano</span>
          <span>{item.receivedAt}</span>
        </div>
      </div>

      {/* justificativa */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/30 dark:bg-blue-900/20">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Justificativa da IA
        </p>
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{item.rationale}</p>
      </div>

      {/* metadados */}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-400">Localização</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">{item.location}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400">IRV Score</dt>
          <dd className="font-mono font-semibold text-blue-600 dark:text-blue-400">{item.irv}</dd>
        </div>
        <div className="col-span-2">
          <dt className="mb-1 text-xs text-gray-400">Confiança da IA</dt>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full rounded-full ${confidenceColor(item.confidence)} transition-all`}
                style={{ width: `${item.confidence * 100}%` }}
              />
            </div>
            <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
              {(item.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </dl>

      {/* ações */}
      {item.status === 'Pendente' && (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onDecision(item.id, 'approved')}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Aprovar O.S.
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onDecision(item.id, 'rejected')}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Rejeitar
          </button>
        </div>
      )}
    </div>
  )
}

export function TriageTable({ queue, onDecision, isUpdating }) {
  return <TriageTableInner queue={queue} onDecision={onDecision} isUpdating={isUpdating} />
}

export function TriageTableInner({ queue, onDecision, isUpdating }) {
  const [selected, setSelected] = useState(null)
  const [localQueue, setLocalQueue] = useState(queue)

  function handleDecision(id, status) {
    const statusLabel = status === 'approved' ? 'Aprovado' : 'Rejeitado'
    setLocalQueue((prev) => prev.map((i) => (i.id === id ? { ...i, status: statusLabel } : i)))
    if (selected?.id === id) {
      setSelected((prev) => ({ ...prev, status: statusLabel }))
    }
    onDecision(id, status)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* tabela 60% */}
      <div className="min-w-0 flex-[1.5] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  ID
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Categoria
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Localização
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Confiança IA
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {localQueue.map((item) => {
                const isActive = selected?.id === item.id
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={[
                      'cursor-pointer transition-colors',
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    ].join(' ')}
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {item.id}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-800 dark:text-gray-200">{item.category}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{item.location}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className={`h-full rounded-full ${confidenceColor(item.confidence)}`}
                            style={{ width: `${item.confidence * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {(item.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* painel detalhe 40% */}
      <div className="w-full lg:w-[400px] lg:shrink-0">
        <DetailPanel item={selected} onDecision={handleDecision} isUpdating={isUpdating} />
      </div>
    </div>
  )
}
