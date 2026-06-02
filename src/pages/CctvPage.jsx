import { CctvGrid } from '../components/cftv/CctvGrid'
import { cctvFeedsMock } from '../mocks/mockData'

export function CctvPage() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Grid de Cameras</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Painel de disponibilidade e estado de conectividade dos pontos CFTV.
        </p>
      </div>

      <CctvGrid feeds={cctvFeedsMock} />
    </section>
  )
}
