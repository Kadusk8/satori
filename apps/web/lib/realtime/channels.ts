// Nomes de canal Pusher — compartilhado entre server (trigger) e client
// (subscribe). Sem dependências de server/browser, pode ser importado dos dois
// lados.

export function tenantChannel(tenantId: string): string {
  return `private-tenant-${tenantId}`
}

export function conversationChannel(conversationId: string): string {
  return `private-conversation-${conversationId}`
}
