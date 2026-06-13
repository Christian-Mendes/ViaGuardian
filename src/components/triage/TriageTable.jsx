import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Circle, Marker, Popup, Tooltip as LeafletTooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix do ícone padrão do Leaflet que falha no Vite/webpack
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function confidenceColor(v) {
  if (v >= 0.85) return 'bg-blue-600'
  if (v >= 0.7) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** Abre coordenadas no Google Maps em nova aba */
function openGoogleMaps(lat, lon) {
  window.open(`https://www.google.com/maps?q=${lat},${lon}&z=17`, '_blank', 'noopener')
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
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center backdrop-blur-sm">
        <svg
          className="h-12 w-12 text-slate-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-gray-300">
            Nenhum evento selecionado
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Clique em um incidente na fila ao lado para revisar detalhes
          </p>
        </div>
      </div>
    )
  }

  // Validação de coordenadas
  const hasValidCoords = item.lat && item.lon && 
                         typeof item.lat === 'number' && 
                         typeof item.lon === 'number' &&
                         !isNaN(item.lat) && !isNaN(item.lon)

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-gray-500">{item.id} · {item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
          <h4 className="mt-1 text-base font-bold text-gray-100">{item.category}</h4>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* ── Localização Geográfica (referência visual) ── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Localização Geográfica</p>
        <div className="flex flex-wrap gap-2">
          {item.neighborhood && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-950/70 px-2.5 py-1 text-xs font-semibold text-blue-300 ring-1 ring-blue-700/50">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
              {item.neighborhood}
            </span>
          )}
          {item.corridor && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-950/70 px-2.5 py-1 text-xs font-semibold text-violet-300 ring-1 ring-violet-700/50">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6z" /></svg>
              {item.corridor}
            </span>
          )}
        </div>
        {hasValidCoords && (
          <div className="mt-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] text-gray-400">
              {item.lat.toFixed(6)}, {item.lon.toFixed(6)}
            </span>
            <button
              type="button"
              onClick={() => openGoogleMaps(item.lat, item.lon)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700/50 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition-all hover:border-blue-500/50 hover:bg-blue-950/40 hover:text-blue-300"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              Ver no Maps
            </button>
          </div>
        )}
      </div>

      {/* Mini-mapa tático com círculo de deduplicação */}
      {hasValidCoords ? (
        <div className="relative h-52 overflow-hidden rounded-xl border border-slate-700 shadow-inner">
          <MapContainer
            key={`triage-map-${item.id}`}
            center={[item.lat, item.lon]}
            zoom={16}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
            zoomControl={false}
            whenReady={(map) => {
              setTimeout(() => map.target.invalidateSize(), 100)
            }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {/* Área de deduplicação geoespacial (raio 12m) */}
            <Circle
              center={[item.lat, item.lon]}
              radius={12}
              pathOptions={{
                color: '#dc2626',
                fillColor: '#ef4444',
                fillOpacity: 0.2,
                weight: 2,
                dashArray: '4 4',
              }}
            >
              <LeafletTooltip permanent direction="top" className="font-mono text-xs">
                Zona de Deduplicação (12m)
              </LeafletTooltip>
            </Circle>
            {/* Círculo maior: área de influência do incidente (50m) */}
            <Circle
              center={[item.lat, item.lon]}
              radius={50}
              pathOptions={{
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.05,
                weight: 1,
                dashArray: '6 3',
              }}
            />
          </MapContainer>
          {/* Overlay de referência no canto inferior */}
          <div className="absolute bottom-2 left-2 right-2 z-[400] flex items-end justify-between gap-2">
            <div className="rounded-md bg-slate-900/90 px-2 py-1 text-[10px] font-semibold text-gray-300 shadow backdrop-blur-sm">
              {item.neighborhood && <span className="text-blue-400">{item.neighborhood}</span>}{item.corridor && <span className="text-gray-500"> · {item.corridor}</span>}
            </div>
            <div className="rounded-lg bg-slate-900/90 px-2 py-1 font-mono text-[9px] text-gray-400 shadow backdrop-blur-sm">
              Edge AI · PostGIS
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-52 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/50">
          <p className="text-sm text-gray-500">Coordenadas indisponíveis</p>
        </div>
      )}

      {/* Validação Multi-Sensor */}
      <div className="rounded-xl border border-emerald-700/50 bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 p-3.5 shadow-inner">
        <div className="mb-2 flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Validação Multi-Sensor</p>
        </div>
        <p className="text-sm leading-relaxed text-gray-300">
          <strong className="font-bold text-emerald-300">{item.recurrence || 1}</strong> sensor(es) independente(s) detectaram esta anomalia na mesma geolocalização nas últimas 24h.
        </p>
        <p className="mt-1.5 text-xs text-gray-500">Prova criptográfica · Sem armazenamento de imagens (Privacy by Design)</p>
      </div>

      {/* Análise Automática */}
      <div className="rounded-xl border border-blue-700/50 bg-blue-950/40 px-4 py-3 shadow-inner">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-400">Análise Automática</p>
        <p className="text-sm leading-relaxed text-gray-300">{item.rationale}</p>
      </div>

      {/* Metadados: IRV + Confiança */}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500">IRV Score</dt>
          <dd className="mt-1 font-mono text-2xl font-bold text-blue-400">{item.irv}</dd>
        </div>
        <div className="col-span-2">
          <dt className="mb-2 text-xs font-medium text-gray-500">Confiança do Modelo</dt>
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800 shadow-inner">
              <div
                className={`h-full rounded-full ${confidenceColor(item.confidence)} shadow-lg transition-all`}
                style={{ width: `${item.confidence * 100}%` }}
              />
            </div>
            <span className="font-mono text-sm font-bold text-gray-200">
              {(item.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </dl>

      {/* ações premium */}
      {(item.status === 'Pendente' || item.status === 'PENDING') && (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onDecision(item.id, 'approved')}
            className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(16,185,129,0.7)] border border-emerald-400/50 disabled:opacity-50 disabled:hover:scale-100"
          >
            ✓ Aprovar e Despachar O.S.
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onDecision(item.id, 'rejected')}
            className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm font-bold text-rose-300 shadow-lg transition-all hover:scale-[1.02] hover:border-rose-500 hover:bg-rose-900/40 disabled:opacity-50 disabled:hover:scale-100"
          >
            ✕ Rejeitar Falso Positivo
          </button>
        </div>
      )}

      {(item.status === 'Aprovado' || item.status === 'approved') && (
        <div className="mt-auto rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-center shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <p className="text-sm font-medium text-emerald-400">
            ✅ Ordem de Serviço Despachada para a Zeladoria (Integração SP156 simulada).
          </p>
        </div>
      )}

      {(item.status === 'Rejeitado' || item.status === 'rejected') && (
        <div className="mt-auto rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-center shadow-[0_0_15px_rgba(244,63,94,0.15)]">
          <p className="text-sm font-medium text-rose-400">
            🚫 Incidente descartado e removido do cálculo de IRV.
          </p>
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

  useEffect(() => {
    setLocalQueue(queue)
  }, [queue])

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
      {/* tabela 60% premium */}
      <div className="min-w-0 flex-[1.5] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50">
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  ID
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  Categoria
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  Localização
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  Confiança IA
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {localQueue.map((item) => {
                const isActive = selected?.id === item.id
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={[
                      'cursor-pointer transition-all',
                      isActive
                        ? 'bg-blue-950/50 ring-1 ring-blue-800/50'
                        : 'hover:bg-slate-800/50',
                    ].join(' ')}
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-gray-500">
                      {item.id}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-200">{item.category}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        {item.neighborhood && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-950/60 px-2 py-0.5 text-[11px] font-medium text-blue-300 ring-1 ring-blue-800/50">
                            {item.neighborhood}
                          </span>
                        )}
                        {item.corridor && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-violet-950/60 px-2 py-0.5 text-[11px] font-medium text-violet-300 ring-1 ring-violet-800/50">
                            {item.corridor}
                          </span>
                        )}
                        {!item.neighborhood && !item.corridor && (
                          <span className="font-mono text-xs text-gray-500">{item.location}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-800 shadow-inner">
                          <div
                            className={`h-full rounded-full ${confidenceColor(item.confidence)} shadow-sm`}
                            style={{ width: `${item.confidence * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-gray-400">
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
