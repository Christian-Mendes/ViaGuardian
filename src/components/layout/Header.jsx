export function Header({ title, subtitle, isDark, onToggleTheme }) {
  return (
    <header className="flex flex-col gap-4 border-b border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {isDark ? 'Modo Claro' : 'Modo Escuro'}
      </button>
    </header>
  )
}
