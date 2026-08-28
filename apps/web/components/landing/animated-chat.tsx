'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

type Bubble = {
  from: 'customer' | 'ai'
  text: string
  meta?: string
}

const SCRIPT: Bubble[] = [
  { from: 'customer', text: 'Oi, vocês têm esse modelo em azul?' },
  { from: 'ai', text: 'Temos sim! Essa aqui é a opção em azul, com garantia de 90 dias.', meta: '📷 foto enviada · R$ 3.290' },
  { from: 'customer', text: 'Consigo ver amanhã de manhã?' },
  { from: 'ai', text: 'Consigo te encaixar às 9h ou 10h30 — qual fica melhor?', meta: '09:41 ✓✓' },
]

const TYPE_MS = 1100
const HOLD_MS = 1600

export function AnimatedChat() {
  const [visible, setVisible] = useState(0) // quantas bolhas já apareceram
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout>

    async function run() {
      for (let i = 0; i <= SCRIPT.length; i++) {
        if (cancelled) return
        if (i === SCRIPT.length) {
          // pausa no final, depois reinicia
          await wait(HOLD_MS * 1.4)
          if (cancelled) return
          setVisible(0)
          setTyping(false)
          await wait(600)
          i = -1
          continue
        }
        setTyping(true)
        await wait(TYPE_MS)
        if (cancelled) return
        setTyping(false)
        setVisible(i + 1)
        await wait(HOLD_MS)
      }
    }

    function wait(ms: number) {
      return new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, ms)
      })
    }

    run()
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [])

  const shown = SCRIPT.slice(0, visible)
  const nextIsAi = SCRIPT[visible]?.from === 'ai'

  return (
    <div className="relative w-full max-w-[380px] rounded-2xl border border-white/10 bg-[#0b0e14] p-4 shadow-[0_40px_120px_-40px_rgba(34,211,238,0.25)]">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22d3ee] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22d3ee]" />
        </span>
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          Atendimento · Satori IA
        </span>
      </div>

      <div className="flex min-h-[220px] flex-col gap-2.5 text-[13px] leading-snug">
        <AnimatePresence initial={false}>
          {shown.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={
                b.from === 'customer'
                  ? 'max-w-[78%] self-start rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-foreground/90'
                  : 'max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3.5 py-2.5 text-foreground'
              }
            >
              {b.text}
              {b.meta && (
                <span
                  className={
                    b.text.includes('foto')
                      ? 'mt-1 block text-[11px] text-[#22d3ee]'
                      : 'mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground'
                  }
                >
                  {b.meta}
                </span>
              )}
            </motion.div>
          ))}

          {typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={
                nextIsAi
                  ? 'flex max-w-[85%] items-center gap-1 self-end rounded-2xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3.5 py-3'
                  : 'flex max-w-[78%] items-center gap-1 self-start rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-3'
              }
            >
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15, ease: 'easeInOut' }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
