import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Painel de Controle CCO', to: '/' },
  { label: 'Triagem Operacional', to: '/triagem' },
  { label: 'CFTV', to: '/cftv' },
]

function navLinkClass({ isActive }) {
  return [
    'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-600 text-white dark:bg-blue-500'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
  ].join(' ')
}

export function Sidebar() {
  return (
    <aside className="w-full border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
      <div className="mb-6 flex items-center justify-between lg:mb-10 lg:block">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-500">
            ViaGuardian
          </p>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Intelligence Center
          </h1>
        </div>
      </div>

      <nav className="grid gap-2">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass} end={item.to === '/'}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
