// Trava manual: contatos com AMBAS as etiquetas abaixo (ex: números internos/de
// teste da loja) nunca recebem mensagem automática — nem resposta da IA a
// mensagem recebida, nem follow-up, nem lembrete de agendamento. Comparação em
// minúsculas porque o frontend já normaliza as tags assim, mas não confiamos
// só nisso (defesa contra escrita direta no banco fora desse fluxo).
const BLOCKED_TAGS = ['jonathan', 'loja']

export function isContactBlockedByTags(tags: string[] | null | undefined): boolean {
  if (!tags || tags.length === 0) return false
  const normalized = tags.map((t) => t.toLowerCase())
  return BLOCKED_TAGS.every((t) => normalized.includes(t))
}
