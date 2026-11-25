// Detecção de plataforma pra PWA — só roda no browser (chamar dentro de useEffect).

export type PwaPlatform = {
  isIOS: boolean
  isAndroid: boolean
  /** Rodando como app instalado (tela inicial), não numa aba do navegador. */
  isStandalone: boolean
  /** Navegador embutido de app (WhatsApp, Instagram, Facebook...) — não instala PWA. */
  isInAppBrowser: boolean
  /** iOS fora do Safari (Chrome/Firefox/Edge iOS, ou navegador embutido). */
  isIOSNonSafari: boolean
  /** Versão maior.menor do iOS, ou null se não for iOS / não der pra ler. */
  iosVersion: number | null
}

export function detectPlatform(): PwaPlatform {
  const ua = navigator.userAgent
  // iPadOS 13+ se apresenta como Mac — o toque denuncia.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)

  const nav = navigator as Navigator & { standalone?: boolean }
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true

  const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua)
  const isIOSNonSafari = isIOS && (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) || isInAppBrowser)

  let iosVersion: number | null = null
  const m = ua.match(/OS (\d+)_(\d+)/)
  if (isIOS && m) iosVersion = Number(m[1]) + Number(m[2]) / 100

  return { isIOS, isAndroid, isStandalone, isInAppBrowser, isIOSNonSafari, iosVersion }
}

/** Web Push no iOS só existe a partir do 16.4 e só com o app instalado. */
export function iosSupportsWebPush(p: PwaPlatform): boolean {
  return p.iosVersion !== null && p.iosVersion >= 16.04
}
