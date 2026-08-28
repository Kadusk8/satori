'use client'

import { motion } from 'framer-motion'
import { RevealGroup, RevealItem } from './reveal'

function BarsGlyph() {
  const heights = [10, 18, 13, 22, 16]
  return (
    <div className="flex h-10 items-end gap-1">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-1.5 rounded-full bg-[#22d3ee]"
          initial={{ height: 4 }}
          animate={{ height: [4, h, h * 0.6, h] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function OrbitGlyph() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center">
      <span className="absolute h-8 w-8 rounded-full border border-white/15" />
      <motion.span
        className="absolute h-1.5 w-1.5 rounded-full bg-[#22d3ee]"
        style={{ originX: '4px', originY: '20px' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
      <span className="h-2 w-2 rounded-full bg-white/40" />
    </div>
  )
}

function CheckGlyph() {
  return (
    <div className="flex h-10 w-10 items-center justify-center">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <motion.circle
          cx="17"
          cy="17"
          r="14"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
        />
        <motion.path
          d="M10 17.5L14.5 22L24 12"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  )
}

function PulseArrowGlyph() {
  return (
    <div className="flex h-10 w-10 items-center justify-center">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <motion.path
          d="M7 24L14 16L19 20L27 9"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        />
        <motion.path
          d="M20 9H27V16"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        />
      </svg>
    </div>
  )
}

const ITEMS = [
  {
    glyph: OrbitGlyph,
    title: 'Atendimento 24/7',
    body: 'Enquanto sua equipe dorme, o Satori continua respondendo — nenhum cliente espera até amanhã.',
  },
  {
    glyph: CheckGlyph,
    title: 'Processo comercial automático',
    body: 'Qualifica, mostra produto, agenda — o funil roda sozinho até onde puder rodar.',
  },
  {
    glyph: BarsGlyph,
    title: 'Mais conversa vira venda',
    body: 'Resposta na hora certa é a diferença entre o cliente comprar com você ou com quem respondeu primeiro.',
  },
  {
    glyph: PulseArrowGlyph,
    title: 'Menos custo operacional',
    body: 'Menos tempo do seu time respondendo "oi, tudo bem" — mais tempo fechando negócio de verdade.',
  },
]

export function ImpactStrip() {
  return (
    <RevealGroup className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {ITEMS.map((item) => (
        <RevealItem key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <item.glyph />
          <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </RevealItem>
      ))}
    </RevealGroup>
  )
}
