import { useState, useRef, useEffect } from 'react'

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    text: 'Olá, Gestor. Sou o assistente do **ViaGuardian Intelligence Center**. Como posso auxiliar sua triagem operacional hoje?',
  },
]

const SUGGESTIONS = [
  'Quais corredores têm maior IRV?',
  'Status do SLA de resposta',
  'Análise da fila de triagem',
  'Status das câmeras CFTV',
]

const AUTO_REPLIES = {
  infraestrutura: 'Análise da infraestrutura viária em tempo real: 17 km de vias monitoradas, 3 pontos críticos requerem intervenção imediata (Santo Amaro, Av. dos Bandeirantes, Radial Leste). Priorização: O.S. de sinalização horizontal.',
  sla: 'O **SLA de Resposta Operacional** atual está em **7.2 minutos** (Meta: <8 min). Taxa de aprovação na triagem: **71%**. Correção de falsos positivos pelo analista: **14%**. Performance dentro do esperado.',
  triage: 'Fila de triagem atual: **4 incidentes pendentes**. Prioridade máxima: **INC-2403** (IRV 91 - Sinalização Apagada, Santo Amaro). Recomendação: Aprovar para abertura de O.S. de manutenção preventiva.',
  irv: 'O **IRV (Índice de Risco Viário)** é calculado por: **IRV = (Wₐ × D) + (Wₕ × S)**, onde Wₐ e Wₕ são pesos de anomalia e histórico, D é o volume de detecções validadas, e S é a incidência de sinistros no Infosiga SP.',
  corredor: 'Com base nos dados atuais, o **Eixo Sul (IRV 91)** e o **Corredor Norte (IRV 84)** apresentam maior criticidade. Recomendo priorizar os eventos INC-2403 e INC-2401 na triagem.',
  confiança: 'A confiança indica a certeza do modelo YOLOv8-Nano na detecção. **Acima de 85%**: aprovação recomendada. **Entre 70–85%**: requer revisão humana. **Abaixo de 70%**: alta probabilidade de falso positivo.',
  câmera: 'Status CFTV: **CAM-005** (Santo Amaro) está **offline** há 42 minutos. **CAM-003** (Av. dos Bandeirantes) apresenta latência elevada (220ms). Acionamento da equipe de infraestrutura recomendado.',
}

function autoReply(text) {
  const lower = text.toLowerCase()
  if (lower.includes('infraestrutura') || lower.includes('via')) return AUTO_REPLIES.infraestrutura
  if (lower.includes('sla') || lower.includes('resposta') || lower.includes('performance')) return AUTO_REPLIES.sla
  if (lower.includes('triage') || lower.includes('triagem') || lower.includes('fila')) return AUTO_REPLIES.triage
  if (lower.includes('irv') || lower.includes('fórmula') || lower.includes('formula')) return AUTO_REPLIES.irv
  if (lower.includes('corredor') || lower.includes('risco')) return AUTO_REPLIES.corredor
  if (lower.includes('confiança') || lower.includes('confianca') || lower.includes('ia')) return AUTO_REPLIES.confiança
  if (lower.includes('câmera') || lower.includes('camera') || lower.includes('offline') || lower.includes('cftv')) return AUTO_REPLIES.câmera
  return 'Consulta registrada. Para análises específicas, utilize os painéis de **Dashboard**, **Triagem** ou **CFTV**. Posso auxiliar com IRV, SLA, status de câmeras ou priorização de corredores.'
}

function renderText(text) {
  // bold simples **...**
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export function AiAgentWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  function send(text) {
    if (!text.trim()) return
    const userMsg = { role: 'user', text: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setTyping(true)

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', text: autoReply(text) }])
      setTyping(false)
    }, 900)
  }

  return (
    <>
      {/* botão flutuante premium */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-2xl shadow-blue-900/40 transition-all hover:scale-105 hover:shadow-blue-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:shadow-blue-500/30 dark:hover:shadow-blue-500/50"
        aria-label="Abrir assistente de IA"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
      </button>

      {/* painel chat premium com glassmorphism */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-700/50 bg-gray-900/80 shadow-2xl shadow-blue-900/20 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/90 dark:shadow-blue-500/20">
          {/* header premium */}
          <div className="flex items-center gap-3 border-b border-gray-700/50 bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Agente ViaGuardian IA</p>
              <p className="text-xs text-blue-100">Assistência operacional em tempo real</p>
            </div>
            <div className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
          </div>

          {/* mensagens com estilo premium */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-gradient-to-b from-gray-900/40 to-gray-900/60 p-5" style={{ maxHeight: '380px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg',
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-900/40'
                      : 'rounded-bl-sm border border-gray-700/60 bg-gray-800/90 text-gray-100 shadow-gray-900/60 backdrop-blur-sm',
                  ].join(' ')}
                >
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1.5 rounded-2xl rounded-bl-sm border border-gray-700/60 bg-gray-800/90 px-5 py-3 shadow-lg backdrop-blur-sm">
                  {[0, 0.15, 0.3].map((d, i) => (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]"
                      style={{ animationDelay: `${d}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* sugestões com design premium */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 border-t border-gray-700/50 bg-gray-900/60 px-5 py-4 backdrop-blur-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-blue-700/60 bg-blue-900/40 px-3.5 py-1.5 text-xs font-medium text-blue-300 shadow-sm transition-all hover:border-blue-600 hover:bg-blue-800/60 hover:text-blue-200 hover:shadow-md"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* input premium */}
          <div className="border-t border-gray-700/50 bg-gray-900/60 px-4 py-4 backdrop-blur-sm">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input) }}
              className="flex items-center gap-3"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua consulta operacional…"
                className="flex-1 rounded-xl border border-gray-700/60 bg-gray-800/80 px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 shadow-inner transition-all focus:border-blue-600 focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/40 transition-all hover:scale-105 hover:shadow-blue-900/60 disabled:opacity-40 disabled:hover:scale-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
