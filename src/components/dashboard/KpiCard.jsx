export function KpiCard({ title, value, note, formula, accent = false }) {
  return (
    <article
      className={[
        'rounded-xl border bg-white p-5 shadow-sm transition dark:bg-gray-900',
        accent
          ? 'border-blue-200 ring-1 ring-blue-100 dark:border-blue-900/60 dark:ring-blue-900/30'
          : 'border-gray-200 dark:border-gray-800',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        {accent && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            Índice
          </span>
        )}
      </div>

      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {value}
      </p>

      {formula && (
        <p className="mt-2 rounded-md bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          {formula}
        </p>
      )}

      {note && <p className="mt-3 text-xs text-blue-600 dark:text-blue-400">{note}</p>}
    </article>
  )
}
