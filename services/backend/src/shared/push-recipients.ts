// Quem recebe push quando chega mensagem de cliente (webhook). Função pura pra
// ser testável — a busca de usuários fica com quem chama.
//
// Regra: push só quando há algo pra um humano fazer.
//   • Conversa com dono (vendedor atribuído) → só o dono, e só se ele ainda estiver ativo.
//   • Sem dono, esperando/em atendimento humano → todos os usuários ativos do tenant.
//   • Sem dono, IA atendendo (ou qualquer outro status) → ninguém. A conversa
//     continua aparecendo em tempo real no painel via Pusher; push de toda
//     mensagem que a IA responde sozinha vira ruído e o usuário desliga as
//     notificações — inclusive as que importam.

export const HUMAN_STATUSES = new Set(['waiting_human', 'human_handling'])

export function messagePushRecipients(input: {
  assignedTo: string | null | undefined
  conversationStatus: string | null | undefined
  /** Usuários ATIVOS do tenant. */
  activeUserIds: string[]
}): string[] {
  const { assignedTo, conversationStatus, activeUserIds } = input
  if (assignedTo) return activeUserIds.includes(assignedTo) ? [assignedTo] : []
  if (conversationStatus && HUMAN_STATUSES.has(conversationStatus)) return [...activeUserIds]
  return []
}
