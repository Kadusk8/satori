'use client'

import Link from 'next/link'
import { motion, useScroll, useMotionValueEvent } from 'framer-motion'
import { useState } from 'react'
import { SatoriLogo } from '@/components/brand/satori-logo'

export function SiteHeader() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)

  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24))

  return (
    <motion.header
      className="sticky top-0 z-30 border-b"
      animate={{
        backgroundColor: scrolled ? 'rgba(9,10,13,0.75)' : 'rgba(9,10,13,0)',
        borderColor: scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0)',
        backdropFilter: scrolled ? 'blur(12px)' : 'blur(0px)',
      }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2">
          <SatoriLogo markClassName="h-8 w-8" wordClassName="h-3.5 w-auto" />
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-white/15 px-5 py-2 text-[13px] font-medium text-foreground/90 transition-colors hover:border-[#22d3ee]/60 hover:text-[#22d3ee]"
        >
          Entrar
        </Link>
      </div>
    </motion.header>
  )
}
