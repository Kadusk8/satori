// Evento de instalação do Chrome/Edge/Samsung (Android e desktop).
//
// O `beforeinstallprompt` costuma disparar logo no carregamento — muitas vezes
// antes do React hidratar. Quem só escuta dentro de um useEffect perde o evento
// e o botão "Instalar" cai na instrução manual. Por isso um script inline no
// <head> (INSTALL_CAPTURE_SCRIPT, no layout raiz) captura e guarda em window;
// os componentes leem de lá.

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

type InstallWindow = Window & { __satoriInstallPrompt?: BeforeInstallPromptEvent | null }

export const INSTALL_READY_EVENT = 'satori:installprompt'

/** Roda antes da hidratação. Mantido mínimo e sem dependências. */
export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__satoriInstallPrompt = e;
  window.dispatchEvent(new Event('${INSTALL_READY_EVENT}'));
});
window.addEventListener('appinstalled', function () {
  window.__satoriInstallPrompt = null;
  window.dispatchEvent(new Event('${INSTALL_READY_EVENT}'));
});
`

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return (window as InstallWindow).__satoriInstallPrompt ?? null
}

/** Avisa quando o evento chega (ou some, após instalar). Retorna o unsubscribe. */
export function onInstallPromptChange(cb: () => void): () => void {
  window.addEventListener(INSTALL_READY_EVENT, cb)
  return () => window.removeEventListener(INSTALL_READY_EVENT, cb)
}

/** Mostra o diálogo nativo. O evento só pode ser usado uma vez. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = getInstallPrompt()
  if (!evt) return 'unavailable'
  ;(window as InstallWindow).__satoriInstallPrompt = null
  await evt.prompt()
  const { outcome } = await evt.userChoice
  window.dispatchEvent(new Event(INSTALL_READY_EVENT))
  return outcome
}
