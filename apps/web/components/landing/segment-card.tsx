'use client'

import { motion } from 'framer-motion'

export function SegmentCard({
  label,
  body,
  from,
  to,
}: {
  label: string
  body: string
  from: string
  to: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[#22d3ee]/30"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22d3ee]">{label}</span>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{body}</p>

      <div className="mt-4 flex flex-col gap-1.5 text-[12px] leading-snug">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="max-w-[85%] self-start rounded-xl rounded-tl-sm bg-white/[0.06] px-3 py-2 text-foreground/80"
        >
          {from}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="max-w-[85%] self-end rounded-xl rounded-tr-sm bg-[#22d3ee]/[0.14] px-3 py-2 text-foreground"
        >
          {to}
        </motion.div>
      </div>
    </motion.div>
  )
}
