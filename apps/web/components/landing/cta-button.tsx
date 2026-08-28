'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function CtaButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}) {
  const base =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 rounded-full bg-[#22d3ee] px-6 py-3 text-sm font-semibold text-black'
      : 'inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-foreground/90 hover:border-[#22d3ee]/60 hover:text-[#22d3ee] transition-colors'

  return (
    <motion.a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className={`${base} ${className}`}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {children}
    </motion.a>
  )
}
