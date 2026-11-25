// Número no ícone do app instalado (Badging API: iOS 16.4+ instalado, Android,
// desktop). Sem suporte, não faz nada. Quem mantém o número em dia com o app
// aberto é a sidebar do dashboard; com o app fechado, o service worker (payload
// do push traz `badge`).

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function setAppBadgeCount(count: number): void {
  const nav = navigator as BadgeNavigator
  if (count > 0) nav.setAppBadge?.(count).catch(() => {})
  else nav.clearAppBadge?.().catch(() => {})
}
