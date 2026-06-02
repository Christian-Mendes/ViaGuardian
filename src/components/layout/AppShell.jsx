import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { AiAgentWidget } from '../ai/AiAgentWidget'

const headerByPath = {
  '/': {
    title: 'Visao Estrategica',
    subtitle: 'KPIs em tempo real, calor de risco e tendencia operacional.',
  },
  '/triagem': {
    title: 'Triagem Operacional',
    subtitle: 'Aprovacao e rejeicao de payloads para despacho tatico.',
  },
  '/cftv': {
    title: 'Monitoramento CFTV',
    subtitle: 'Acompanhamento de feeds com alertas de disponibilidade.',
  },
}

function getDefaultDark() {
  return localStorage.getItem('viaguardian-theme') === 'dark'
}

export function AppShell() {
  const [isDark, setIsDark] = useState(getDefaultDark)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('viaguardian-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const header = headerByPath[location.pathname] ?? headerByPath['/']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col lg:flex-row">
        <Sidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <Header
            title={header.title}
            subtitle={header.subtitle}
            isDark={isDark}
            onToggleTheme={() => setIsDark((prev) => !prev)}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <AiAgentWidget />
    </div>
  )
}
