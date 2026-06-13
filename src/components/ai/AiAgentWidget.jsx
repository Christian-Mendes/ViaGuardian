import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ─────────────────────────────────────────────────────────────────────────────
// Menu de sugestões organizado por categoria
// ─────────────────────────────────────────────────────────────────────────────
const MENU_CATEGORIES = [
  {
    id: 'operacional',
    label: 'Operacional',
    color: '#3B82F6',
    questions: [
      'Status da fila de triagem',
      'Quais corredores têm maior IRV?',
      'Status geral das câmeras CFTV',
      'SLA de resposta atual',
    ],
  },
  {
    id: 'tecnico',
    label: 'Técnico',
    color: '#10B981',
    questions: [
      'Como funciona o cálculo do IRV?',
      'O que é deduplicação geoespacial?',
      'Nível de confiança do modelo IA',
      'O que é Privacy by Design?',
    ],
  },
  {
    id: 'incidentes',
    label: 'Incidentes',
    color: '#F59E0B',
    questions: [
      'Resumo de anomalias hoje',
      'Incidentes críticos ativos',
      'Corredores em alerta máximo',
      'Como despachar uma O.S.?',
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Base de conhecimento expandida para auto-resposta
// ─────────────────────────────────────────────────────────────────────────────
const KB = {
  // Operacional
  'fila de triagem': 'Fila de triagem atual: **4 incidentes pendentes**. Prioridade máxima: **INC-2403** (IRV 91 — Sinalização Apagada, Santo Amaro). **INC-2401** (IRV 84 — Quase-acidente, Itaim Bibi) é o segundo mais urgente. Recomendo revisar os dois primeiro.',
  'corredores': 'Com base nos dados atuais: **Eixo Sul (IRV 91)** — Santo Amaro é crítico. **Corredor Norte (IRV 84)** — Itaim Bibi requer atenção. **Marginal Pinheiros (IRV 64)** está em nível moderado. Os demais corredores estão dentro do parâmetro normal.',
  'cftv': 'Status CFTV: **CAM-005** (Santo Amaro x João Dias) — **OFFLINE** há ~42 minutos. **CAM-003** (Av. dos Bandeirantes) — Latência elevada (**220ms**, limiar: 100ms). 4 câmeras operando normalmente. Acionamento de equipe de infraestrutura recomendado para as duas câmeras afetadas.',
  'sla': 'SLA de resposta atual: **7.2 min** (Meta: <8 min ✅). Taxa de aprovação na triagem: **71%**. Correção de falsos positivos: **14%**. Uptime de câmeras: **66.7%**. Performance geral **dentro do esperado**, porém CAM-005 offline pressiona o uptime.',

  // Técnico
  'irv': 'O **IRV (Índice de Risco Viário)** é calculado pela fórmula: **IRV = (Wₐ × D) + (Wₕ × S)**, onde:\n• **Wₐ** e **Wₕ** são pesos de anomalia e histórico\n• **D** é o volume de detecções validadas por sensores independentes\n• **S** é a incidência histórica de sinistros (fonte: Infosiga SP)\n\nEscala: 0–100. Acima de **80 = Crítico**, 60–79 = Alto, abaixo de 60 = Moderado.',
  'deduplicação': 'A **deduplicação geoespacial** é um processo do PostGIS que agrupa eventos detectados por múltiplos sensores em um raio de **12 metros**. Isso evita que o mesmo buraco ou anomalia gere múltiplos incidentes duplicados. O sistema usa hashing criptográfico das coordenadas para identificar o cluster.',
  'confiança': 'O score de **confiança do modelo (YOLOv8-Nano)** indica a certeza da inferência:\n• **≥ 85%** — Aprovação automática recomendada\n• **70–84%** — Requer revisão humana na triagem\n• **< 70%** — Alta probabilidade de falso positivo, rejeitar\n\nO limiar de 70% foi calibrado para o contexto viário de São Paulo.',
  'privacy': 'O ViaGuardian opera com **Privacy by Design (LGPD)**:\n• Frames de vídeo **NUNCA** são armazenados ou transmitidos\n• Apenas metadados numéricos (classe, confiança, coordenadas) saem do dispositivo\n• O identificador do dispositivo é um **hash SHA-256** unidirecional — não permite engenharia reversa\n• Dados anonimizados antes de qualquer transmissão ao servidor',

  // Incidentes
  'anomalias': 'Resumo de anomalias nas últimas 24h: **12 buracos/depressões** (categoria geológica), **3 sinalizações apagadas**, **2 obstruções de via**, **2 quase-acidentes** (crítico) e **1 comportamento de risco**. Total: **20 eventos**, dos quais **14 foram aprovados** para O.S.',
  'crítico': 'Incidentes críticos ativos no momento: **INC-2401** — Quase-acidente no Eixo Norte (Itaim Bibi, IRV 84, confiança 94%). **INC-2403** — Sinalização apagada no Eixo Sul (Santo Amaro, IRV 91, confiança 88%). Ambos aguardam decisão na fila de triagem.',
  'alerta': 'Corredores em **alerta máximo** (IRV > 80):\n1. **Eixo Sul** — Santo Amaro: IRV 91 ⚠️\n2. **Corredor Norte** — Itaim Bibi: IRV 84 ⚠️\n\nCorredores em estado **moderado** (IRV 60–80):\n• Anel Leste — Tatuapé: IRV 71\n• Marginal Pinheiros — Pinheiros: IRV 64',
  'ordem de serviço': 'Para **despachar uma O.S.**, selecione o incidente na fila de triagem, revise o frame de evidência no painel lateral e clique em **"✓ Aprovar e Despachar O.S."**. O sistema envia automaticamente a solicitação à integração SP156 com os dados de geolocalização e tipo de anomalia. A O.S. fica registrada com ID rastreável.',
}

function autoReply(text) {
  const lower = text.toLowerCase()

  if (lower.includes('fila') || lower.includes('triagem') || lower.includes('pendente')) return KB['fila de triagem']
  if (lower.includes('corredor') || lower.includes('maior irv') || lower.includes('risco')) return KB['corredores']
  if (lower.includes('câmera') || lower.includes('camera') || lower.includes('cftv') || lower.includes('offline') || lower.includes('status')) return KB['cftv']
  if (lower.includes('sla') || lower.includes('resposta') || lower.includes('performance') || lower.includes('uptime')) return KB['sla']
  if (lower.includes('irv') || lower.includes('fórmula') || lower.includes('cálculo') || lower.includes('calculo') || lower.includes('índice')) return KB['irv']
  if (lower.includes('deduplicação') || lower.includes('deduplicacao') || lower.includes('geoespacial') || lower.includes('PostGIS')) return KB['deduplicação']
  if (lower.includes('confiança') || lower.includes('confianca') || lower.includes('ia') || lower.includes('modelo') || lower.includes('yolo')) return KB['confiança']
  if (lower.includes('privacy') || lower.includes('lgpd') || lower.includes('lgdp') || lower.includes('privacidade') || lower.includes('sha')) return KB['privacy']
  if (lower.includes('anomal') || lower.includes('resumo') || lower.includes('hoje') || lower.includes('buraco') || lower.includes('24')) return KB['anomalias']
  if (lower.includes('crítico') || lower.includes('critico') || lower.includes('ativo') || lower.includes('emergência')) return KB['crítico']
  if (lower.includes('alerta') || lower.includes('máximo') || lower.includes('maximo')) return KB['alerta']
  if (lower.includes('o.s.') || lower.includes('ordem') || lower.includes('despachar') || lower.includes('aprovar') || lower.includes('zeladoria')) return KB['ordem de serviço']

  return 'Consulta registrada. Posso auxiliar com:\n• **IRV** e corredores de risco\n• **Status CFTV** e câmeras\n• **Fila de triagem** e incidentes\n• **SLA** e métricas operacionais\n• **Funcionamento técnico** do sistema\n\nTente uma das sugestões do menu ou refine sua pergunta.'
}

// Renderiza markdown simples: **negrito** e quebras de linha
function renderText(text) {
  return text.split(/(\*\*[^*]+\*\*|\n)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
    }
    if (part === '\n') return <br key={i} />
    return part
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export function AiAgentWidget() {
  const [open, setOpen] = useState(false)
  /** 'menu' | 'chat' */
  const [view, setView] = useState('menu')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (open && view === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, view])

  useEffect(() => {
    if (open && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, view])

  function send(text) {
    if (!text.trim()) return
    const userMsg = { role: 'user', text: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setTyping(true)
    setView('chat')

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', text: autoReply(text) }])
      setTyping(false)
    }, 700 + Math.random() * 400)
  }

  function handleMenuQuestion(q) {
    setView('chat')
    send(q)
  }

  function goToMenu() {
    setView('menu')
  }

  function resetChat() {
    setMessages([])
    setView('menu')
    setInput('')
    setTyping(false)
  }

  return createPortal(
    <>
      {/* ── Botão flutuante ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-2xl shadow-blue-900/40 transition-all hover:scale-105 hover:shadow-blue-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Abrir assistente de IA"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
      </button>

      {/* ── Painel principal ──────────────────────────────────────────────── */}
      <div
        className="fixed bottom-24 right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-700/50 bg-gray-900/90 shadow-2xl shadow-blue-900/20 backdrop-blur-md transition-all duration-200"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.97)',
        }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-700/50 bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Agente ViaGuardian IA</p>
            <p className="text-[11px] text-blue-200 truncate">Assistência operacional em tempo real</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Indicador online */}
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
            {/* Botão limpar / voltar ao menu — sempre visível */}
            {view === 'chat' && (
              <button
                type="button"
                onClick={goToMenu}
                title="Voltar ao menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white transition-all hover:bg-white/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </button>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={resetChat}
                title="Nova conversa"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white transition-all hover:bg-white/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── VISÃO: MENU ───────────────────────────────────────────────────── */}
        {view === 'menu' && (
          <div className="flex flex-col gap-0 overflow-y-auto" style={{ maxHeight: '420px' }}>
            {/* Intro */}
            <div className="px-4 py-3.5 border-b border-gray-700/40 bg-gray-900/60">
              <p className="text-sm text-gray-300 leading-relaxed">
                Olá, Gestor. Como posso auxiliar sua operação hoje?
              </p>
            </div>

            {/* Categorias */}
            {MENU_CATEGORIES.map((cat) => (
              <div key={cat.id} className="border-b border-gray-700/30">
                {/* Label da categoria */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/40">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: cat.color }}
                  >
                    {cat.label}
                  </p>
                </div>
                {/* Perguntas */}
                <div className="flex flex-col divide-y divide-gray-800/60">
                  {cat.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleMenuQuestion(q)}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-left text-sm text-gray-300 transition-all hover:bg-gray-800/60 hover:text-white"
                    >
                      <span>{q}</span>
                      <svg className="h-3.5 w-3.5 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Input livre no menu */}
            <div className="border-t border-gray-700/50 bg-gray-900/60 px-3 py-3">
              <form
                onSubmit={(e) => { e.preventDefault(); send(input) }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ou escreva sua consulta…"
                  className="flex-1 rounded-xl border border-gray-700/60 bg-gray-800/80 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 shadow-inner transition-all focus:border-blue-600 focus:bg-gray-800 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-500 disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── VISÃO: CHAT ───────────────────────────────────────────────────── */}
        {view === 'chat' && (
          <>
            {/* Barra "Voltar ao menu" */}
            <div className="border-b border-gray-700/40 bg-gray-900/70 px-4 py-2">
              <button
                type="button"
                onClick={goToMenu}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 transition-all hover:text-blue-400"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Voltar ao menu
              </button>
            </div>

            {/* Histórico de mensagens */}
            <div className="flex flex-col gap-3 overflow-y-auto bg-gradient-to-b from-gray-900/40 to-gray-900/60 p-4" style={{ maxHeight: '340px' }}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700/60">
                      <svg className="h-3 w-3 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={[
                      'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-lg',
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-900/40'
                        : 'rounded-bl-sm border border-gray-700/60 bg-gray-800/90 text-gray-100 shadow-gray-900/60',
                    ].join(' ')}
                  >
                    {renderText(msg.text)}
                  </div>
                </div>
              ))}

              {/* Digitando… */}
              {typing && (
                <div className="flex justify-start">
                  <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700/60">
                    <svg className="h-3 w-3 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-gray-700/60 bg-gray-800/90 px-4 py-3 shadow-lg">
                    <div className="flex gap-1.5">
                      {[0, 0.15, 0.3].map((d, i) => (
                        <span
                          key={i}
                          className="h-2 w-2 animate-bounce rounded-full bg-blue-400"
                          style={{ animationDelay: `${d}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Sugestões contextuais rápidas no rodapé do chat */}
            <div className="flex flex-wrap gap-1.5 border-t border-gray-700/40 bg-gray-900/60 px-3 py-2">
              {['Fila de triagem', 'Status CFTV', 'IRV Eixo Sul'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-blue-700/50 bg-blue-900/30 px-3 py-1 text-[11px] font-medium text-blue-300 transition-all hover:border-blue-500 hover:bg-blue-800/50"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-gray-700/50 bg-gray-900/60 px-3 py-3">
              <form
                onSubmit={(e) => { e.preventDefault(); send(input) }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Digite sua consulta operacional…"
                  className="flex-1 rounded-xl border border-gray-700/60 bg-gray-800/80 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 shadow-inner transition-all focus:border-blue-600 focus:bg-gray-800 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || typing}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
