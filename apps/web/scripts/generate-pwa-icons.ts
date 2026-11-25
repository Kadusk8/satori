// Gera os ícones PNG do app (public/icons/*.png) a partir do símbolo oficial
// (o mesmo desenho de public/brand/satori-simbolo.svg).
// Uso (de apps/web): npx tsx scripts/generate-pwa-icons.ts
//
// Os PNGs anteriores tinham sido gerados de uma página em que o logo não
// carregou — saíram transparentes com o ícone de "imagem quebrada", e o iPhone
// mostrava um quadrado branco na tela inicial. Por isso a geração agora é a
// partir do SVG, sem navegador no meio.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const CYAN = '#4FC9E9'
const INK = '#0d1117'
const root = path.resolve(import.meta.dirname, '..')
const out = (name: string) => path.join(root, 'public/icons', name)

// Ensō + bolinha, em coordenadas 0–120 (o mesmo desenho do satori-simbolo.svg).
function glyph(color: string, transform: string): string {
  return `<g transform="${transform}">
    <mask id="mc"><rect width="120" height="120" fill="#fff"/><polygon points="60,58 77,-40 142,1" fill="#000"/></mask>
    <g mask="url(#mc)"><path d="M16 60a44 44 0 1 0 88 0a44 44 0 1 0-88 0ZM30 56a34 34 0 1 0 68 0a34 34 0 1 0-68 0Z" fill="${color}" fill-rule="evenodd"/></g>
    <circle cx="92" cy="19" r="9" fill="${color}"/>
  </g>`
}

const svg = (body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${body}</svg>`)

// Quadrado cheio, sem transparência: o iOS e o Android aplicam a própria máscara.
const fullBleed = svg(`<rect width="120" height="120" fill="${CYAN}"/>${glyph(INK, 'translate(18 18) scale(.7)')}`)
// Com cantos arredondados (como o logo), pra quem mostra o ícone sem máscara.
const rounded = svg(`<rect width="120" height="120" rx="28" fill="${CYAN}"/>${glyph(INK, 'translate(18 18) scale(.7)')}`)
// Silhueta branca em fundo transparente, ocupando quase todo o quadro (badge da barra de status do Android).
const badge = svg(glyph('#ffffff', 'translate(4 6) scale(.93)'))

async function render(source: Buffer, size: number, file: string, opts: { flatten?: boolean } = {}) {
  let img = sharp(source, { density: 1200 }).resize(size, size)
  // flatten remove o canal alfa — o apple-touch-icon não pode ter transparência.
  if (opts.flatten) img = img.flatten({ background: CYAN })
  await img.png({ compressionLevel: 9 }).toFile(out(file))
  console.log('ok', file, `${size}x${size}`)
}

async function main() {
  await render(fullBleed, 180, 'apple-touch-icon.png', { flatten: true })
  await render(rounded, 192, 'icon-192.png')
  await render(rounded, 512, 'icon-512.png')
  await render(fullBleed, 512, 'icon-maskable-512.png', { flatten: true })
  await render(badge, 72, 'badge-72.png')
  // SVG do favicon em sincronia com o desenho acima.
  await writeFile(out('icon.svg'), rounded)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
