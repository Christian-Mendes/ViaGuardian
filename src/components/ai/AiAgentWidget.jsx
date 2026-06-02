import { useState, useRef, useEffect } from 'react'

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    text: 'Olá, Gestor. Sou o assistente do **ViaGuardian Intelligence Center**. Como posso auxiliar sua triagem operacional hoje?',
  },
]

const SUGGESTIONS = [
  'Quais corredores têm maior IRV agora?',
  'Explique a fórmula do IRV',
  'Como interpretar a confiança da IA?',
  'Quais câmeras estão offline?',
]

const AUTO_REPLIES = {
  irv: 'O **IRV (Índice de Risco Viário)** é calculado por: **IRV = (Wₐ × D) + (Wₕ × S)**, onde Wₐ e Wₕ são pesos de anomalia e histórico, D é o volume de detecções validadas, e S é a incidência de sinistros no Infosiga SP.',
  corredor: 'Com base nos dados atuais, o **Eixo Sul (IRV 91)** e o **Corredor Norte (IRV 84)** apresentam maior criticidade. Recomendo priorizar os eventos INC-2403 e INC-2401 na triagem.',
  confiança: 'A confiança indica a certeza do modelo YOLOv8-Nano na detecção. Acima de 85% → aprovação recomendada. Entre 70–85% → requer revisão humana. Abaixo de 70% → alta probabilidade de falso positivo.',
  câmera: 'A câmera **CAM-005** (Santo Amaro x João Dias) está **offline**. A **CAM-003** (Av. dos Bandeirantes) apresenta alta latência (220ms). Recomendo acionar a equipe de manutenção.',
}

function autoReply(text) {
  const lower = text.toLowerCase()
  if (lower.includes('irv') || lower.includes('fórmula') || lower.includes('formula')) return AUTO_REPLIES.irv
  if (lower.includes('corredor') || lower.includes('risco')) return AUTO_REPLIES.corredor
  if (lower.includes('confiança') || lower.includes('confianca') || lower.includes('ia')) return AUTO_REPLIES.confiança
  if (lower.includes('câmera') || lower.includes('camera') || lower.includes('offline') || lower.includes('cftv')) return AUTO_REPLIES.câmera
  return 'Analisando os dados operacionais em tempo real. Para orientações específicas, consulte os painéis de Triagem ou CFTV.'
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
      {/* botão flutuante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Abrir assistente de IA"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
      </button>

      {/* painel chat */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          {/* header */}
          <div className="flex items-center gap-3 border-b border-gray-100 bg-blue-600 px-4 py-3 dark:border-gray-800">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Agente ViaGuardian IA</p>
              <p className="text-[11px] text-blue-200">Assistente operacional de trânsito</p>
            </div>
          </div>

          {/* mensagens */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" style={{ maxHeight: '340px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-blue-600 text-white'
                      : 'rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
                  ].join(' ')}
                >
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3 dark:bg-gray-800">
                  {[0, 0.2, 0.4].map((d, i) => (
                    <span
                      key={i}
                      className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: `${d}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* sugestões */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* input */}
          <div className="border-t border-gray-100 px-3 py-3 dark:border-gray-800">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input) }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte ao assistente…"
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-blue-900/40"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
