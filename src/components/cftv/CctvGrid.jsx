function statusMeta(status) {
  const map = {
    online: {
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
      label: 'Online',
    },
    latency: {
      dot: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
      label: 'Alta Latência',
    },
    offline: {
      dot: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800',
      label: 'Offline',
    },
  }
  return map[status] ?? map.offline
}

export function CctvGrid({ feeds }) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {feeds.map((feed) => {
        const meta = statusMeta(feed.status)
        const isOffline = feed.status === 'offline'

        return (
          <article
            key={feed.id}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            {/* vídeo simulado */}
            <div className="relative aspect-video bg-gray-900">
              {isOffline ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  </svg>
                  <p className="text-xs text-gray-500">Sinal não disponível</p>
                </div>
              ) : (
                <>
                  {/* linhas de varredura simuladas */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
                  <div className="absolute inset-0 overflow-hidden opacity-20">
                    {[10, 25, 40, 55, 70, 85].map((y) => (
                      <div
                        key={y}
                        className="absolute w-full border-t border-emerald-500/30"
                        style={{ top: `${y}%` }}
                      />
                    ))}
                  </div>
                  {/* scanline animado */}
                  <div className="absolute left-0 right-0 h-[2px] animate-[scan_3s_ease-in-out_infinite] bg-emerald-400/20" />
                  {/* crosshair canto */}
                  <div className="absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-emerald-400/60" />
                  <div className="absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-emerald-400/60" />
                  <div className="absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-emerald-400/60" />
                  <div className="absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-emerald-400/60" />
                  {/* dot gravando */}
                  <div className="absolute left-3 top-3 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                    <span className="font-mono text-[9px] text-white/70">REC</span>
                  </div>
                  {/* métricas IA */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between font-mono text-[9px] text-white/70">
                    <span>YOLOv8-Nano · Edge AI</span>
                    <span>{feed.fps} fps</span>
                  </div>
                </>
              )}
            </div>

            {/* info */}
            <div className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                  {feed.location}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-gray-400">{feed.id}</p>
                {!isOffline && (
                  <p className="mt-1 font-mono text-[10px] text-gray-400">
                    Latência IA: <span className={feed.latency > 100 ? 'text-amber-500' : 'text-emerald-500'}>{feed.latency}ms</span>
                  </p>
                )}
              </div>
              <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.badge}`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${!isOffline ? 'animate-pulse' : ''}`} />
                  {meta.label}
                </span>
              </span>
            </div>
          </article>
        )
      })}
    </section>
  )
}
