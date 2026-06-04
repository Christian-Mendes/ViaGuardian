export function KpiCard({ title, value, note, formula, accent = false }) {
  return (
    <article
      className={[
        'rounded-2xl border bg-slate-900 p-6 shadow-lg transition-all hover:shadow-xl',
        accent
          ? 'border-blue-700/60 bg-gradient-to-br from-slate-900 to-blue-950/40 ring-1 ring-blue-600/30 shadow-blue-900/30'
          : 'border-slate-800 hover:border-slate-700',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-400">{title}</p>
        {accent && (
          <span className="rounded-full bg-blue-600/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 ring-1 ring-blue-500/40">
            Índice
          </span>
        )}
      </div>

      <p className="mt-4 font-mono text-4xl font-bold tracking-tight text-gray-100">
        {value}
      </p>

      {formula && (
        <p className="mt-3 rounded-lg bg-slate-800/60 px-3 py-2 font-mono text-xs text-gray-300 shadow-inner">
          {formula}
        </p>
      )}

      {note && <p className="mt-3 text-xs font-medium text-blue-400">{note}</p>}
    </article>
  )
}
