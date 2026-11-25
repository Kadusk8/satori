// Telas de abertura do app instalado no iPhone. Sem elas o iOS abre o app com
// tela BRANCA (ignora o background_color do manifest). Cada imagem só é usada se
// bater exatamente com a tela do aparelho (media query abaixo), então a lista
// cobre os tamanhos de tela em uso — vários modelos compartilham o mesmo tamanho.
//
// Imagens geradas por scripts/generate-ios-splash.ts (rodar de novo se a lista
// ou a marca mudar). Só retrato: o app no celular é usado em pé.

export type IosScreen = { width: number; height: number; dpr: 2 | 3 }

export const IOS_SCREENS: IosScreen[] = [
  { width: 440, height: 956, dpr: 3 }, // 16 Pro Max
  { width: 402, height: 874, dpr: 3 }, // 16 Pro
  { width: 430, height: 932, dpr: 3 }, // 16 Plus, 15 Plus/Pro Max, 14 Pro Max
  { width: 393, height: 852, dpr: 3 }, // 16, 15, 15 Pro, 14 Pro
  { width: 428, height: 926, dpr: 3 }, // 14 Plus, 13/12 Pro Max
  { width: 390, height: 844, dpr: 3 }, // 14, 13, 13 Pro, 12, 12 Pro
  { width: 375, height: 812, dpr: 3 }, // 13 mini, 12 mini, 11 Pro, XS, X
  { width: 414, height: 896, dpr: 3 }, // 11 Pro Max, XS Max
  { width: 414, height: 896, dpr: 2 }, // 11, XR
  { width: 375, height: 667, dpr: 2 }, // SE (2ª/3ª), 8
]

export function splashFileName(s: IosScreen): string {
  return `splash-${s.width * s.dpr}x${s.height * s.dpr}.png`
}

export function iosStartupImages() {
  return IOS_SCREENS.map((s) => ({
    url: `/icons/splash/${splashFileName(s)}`,
    media: `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`,
  }))
}
