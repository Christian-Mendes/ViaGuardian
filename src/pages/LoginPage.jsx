import { Link } from 'react-router-dom'

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-500">
            ViaGuardian
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Intelligence Center</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Acesse o painel de mitigacao e monitoramento urbano.
          </p>
        </div>

        <form className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</span>
            <input
              type="email"
              placeholder="operacoes@viaguardian.com"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Senha</span>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-500"
            />
          </label>

          <button
            type="button"
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Acesso de demonstracao. Ir para o{' '}
          <Link to="/" className="font-semibold text-blue-600 hover:underline dark:text-blue-500">
            Dashboard CCO
          </Link>
        </p>
      </div>
    </div>
  )
}
