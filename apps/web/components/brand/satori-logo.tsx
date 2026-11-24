import { useId } from 'react'

// Marca do Satori: ícone ciano com um ensō (círculo zen de um traço só) aberto e uma bolinha na abertura.
// Cor chapada, sem degradê. O nome "SATORI" é desenhado com traços (sem depender de fonte) e herda a cor do texto.
export const SATORI_COR = '#4FC9E9'
const SATORI_ESCURO = '#0d1117'

export function SatoriMark({ className, title = 'Satori' }: { className?: string; title?: string }) {
  const mask = `satori-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="120" rx="28" fill={SATORI_COR} />
      <g transform="translate(18 18) scale(.7)">
        <mask id={mask}>
          <rect width="120" height="120" fill="#fff" />
          <polygon points="60,58 77,-40 142,1" fill="#000" />
        </mask>
        <g mask={`url(#${mask})`}>
          <path d="M16 60a44 44 0 1 0 88 0a44 44 0 1 0-88 0ZM30 56a34 34 0 1 0 68 0a34 34 0 1 0-68 0Z" fill={SATORI_ESCURO} fillRule="evenodd" />
        </g>
        <circle cx="92" cy="19" r="9" fill={SATORI_ESCURO} />
      </g>
    </svg>
  )
}

export function SatoriWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 294 64" className={className} role="img" aria-label="Satori" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
        <path transform="translate(0 0)" d="M36 12C30 3 6 3 6 18C6 33 36 26 36 41C36 55 10 55 3 44" />
        <path transform="translate(54 0)" d="M4 56L20 4L36 56M10 36H30" />
        <path transform="translate(108 0)" d="M2 6H38M20 6V56" />
        <path transform="translate(162 0) translate(26 30) scale(1.06) translate(-26 -30)" d="M42.07 10.85A25 25 0 1 1 28.18 5.10" />
        <path transform="translate(228 0)" d="M5 56V4H22C38 4 38 30 22 30H5M22 30L38 56" />
        <path transform="translate(282 0)" d="M4 4V56" />
      </g>
    </svg>
  )
}

/** Símbolo + nome lado a lado. Tamanhos pelas classes (h-*). */
export function SatoriLogo({ className, markClassName = 'h-7 w-7', wordClassName = 'h-3.5 w-auto' }: { className?: string; markClassName?: string; wordClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <SatoriMark className={`shrink-0 ${markClassName}`} />
      <SatoriWordmark className={`text-foreground ${wordClassName}`} />
    </span>
  )
}
