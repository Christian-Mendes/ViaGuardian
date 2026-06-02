function intensityColor(intensity) {
  if (intensity >= 0.8) return '#dc2626' // vermelho - crítico
  if (intensity >= 0.6) return '#f97316' // laranja - alto
  if (intensity >= 0.4) return '#f59e0b' // âmbar - moderado
  return '#2563eb' // azul - baixo
}

export function HeatmapPanel({ points }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Mapa de Calor Preditivo
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Concentração de risco para motociclistas — fusão CFTV + telemetria + Infosiga SP.
          </p>
        </div>

        <div className="hidden items-center gap-3 text-[11px] text-gray-500 sm:flex dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            Baixo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Moderado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            Alto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
            Crítico
          </span>
        </div>
      </div>

      <div className="relative h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:border-gray-800 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
        {/* grade simulando malha urbana */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">
              <path
                d="M 6 0 L 0 0 0 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.15"
                className="text-gray-300 dark:text-gray-700"
              />
            </pattern>
            {points.map((p) => (
              <radialGradient key={`g-${p.id}`} id={`heat-${p.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={intensityColor(p.intensity)} stopOpacity={0.75} />
                <stop offset="55%" stopColor={intensityColor(p.intensity)} stopOpacity={0.25} />
                <stop offset="100%" stopColor={intensityColor(p.intensity)} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>

          <rect width="100" height="100" fill="url(#grid)" />

          {/* "vias" estilizadas */}
          <path d="M0 55 L100 35" stroke="currentColor" strokeWidth="0.4" className="text-gray-300 dark:text-gray-700" />
          <path d="M40 0 L55 100" stroke="currentColor" strokeWidth="0.4" className="text-gray-300 dark:text-gray-700" />
          <path d="M0 80 L100 75" stroke="currentColor" strokeWidth="0.4" className="text-gray-300 dark:text-gray-700" />

          {points.map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={8 + p.intensity * 14} fill={`url(#heat-${p.id})`} />
              <circle
                cx={p.x}
                cy={p.y}
                r={1.2}
                fill={intensityColor(p.intensity)}
                stroke="white"
                strokeWidth="0.4"
              />
            </g>
          ))}
        </svg>

        {/* labels HTML */}
        {points.map((p) => (
          <div
            key={`lbl-${p.id}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[140%] whitespace-nowrap rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-700 shadow-sm backdrop-blur dark:bg-gray-800/90 dark:text-gray-200"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {p.label}
            <span className="ml-1.5 font-mono text-[9px] text-gray-500 dark:text-gray-400">
              {(p.intensity * 100).toFixed(0)}
            </span>
          </div>
        ))}

        <div className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2.5 py-1 font-mono text-[10px] text-gray-500 shadow-sm backdrop-blur dark:bg-gray-800/90 dark:text-gray-400">
          PostGIS · R-Tree · 12m radius
        </div>
      </div>
    </section>
  )
}
