import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-8">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            {/* Ícone de erro */}
            <div className="flex justify-center">
              <div className="rounded-full bg-rose-950/50 p-4">
                <svg
                  className="h-12 w-12 text-rose-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
            </div>

            {/* Mensagem */}
            <div className="space-y-3 text-center">
              <h2 className="text-2xl font-bold text-gray-100">
                Erro Inesperado
              </h2>
              <p className="text-sm leading-relaxed text-gray-400">
                Ocorreu um erro ao renderizar esta página. Isso geralmente acontece ao navegar entre páginas rapidamente.
              </p>
            </div>

            {/* Detalhes técnicos (colapsável) */}
            {this.state.error && (
              <details className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-300">
                  Detalhes Técnicos
                </summary>
                <pre className="mt-3 overflow-auto text-[10px] text-rose-400">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            {/* Ações */}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02]"
              >
                Recarregar Página
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-gray-300 shadow-lg transition-all hover:scale-[1.02]"
              >
                Ir para Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
