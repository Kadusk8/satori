// Gera as telas de abertura do iPhone (public/icons/splash/*.png): símbolo do
// Satori centralizado sobre o fundo do app (#09090b, igual ao theme_color).
// Uso (de apps/web): npx tsx scripts/generate-ios-splash.ts

import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { IOS_SCREENS, splashFileName } from '../lib/pwa/ios-splash'

const BG = '#09090b'
const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'public/icons/splash')

async function main() {
  const svg = await readFile(path.join(root, 'public/brand/satori-simbolo.svg'))
  await mkdir(outDir, { recursive: true })

  for (const s of IOS_SCREENS) {
    const w = s.width * s.dpr
    const h = s.height * s.dpr
    // Símbolo com ~28% da largura, como no ícone da tela inicial ampliado.
    const size = Math.round(w * 0.28)
    const mark = await sharp(svg, { density: 600 }).resize(size, size).png().toBuffer()

    await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
      .composite([{ input: mark, left: Math.round((w - size) / 2), top: Math.round((h - size) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(outDir, splashFileName(s)))
    console.log('ok', splashFileName(s))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
