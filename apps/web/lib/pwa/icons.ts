// URLs dos ícones do app com versão, pra furar o cache do navegador e do
// sistema quando o desenho muda. SUBIR ICON_VERSION sempre que rodar
// scripts/generate-pwa-icons.ts com um logo novo (e o ?v= em public/sw.js).
// v2: ícones regerados do SVG — os anteriores eram PNGs quebrados (quadrado branco no iPhone).

export const ICON_VERSION = '2'

export function iconUrl(file: string): string {
  return `/icons/${file}?v=${ICON_VERSION}`
}
