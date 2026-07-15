// Trava manual: contatos com AMBAS as etiquetas abaixo (ex: números internos/de
// teste da loja) nunca recebem mensagem automática — nem resposta da IA a
// mensagem recebida, nem follow-up, nem lembrete de agendamento. Comparação em
// minúsculas porque o frontend já normaliza as tags assim, mas não confiamos
// só nisso (defesa contra escrita direta no banco fora desse fluxo).
//
// Duas fontes possíveis, combinadas com OR (qualquer uma das duas ativa a
// trava): as tags do painel/CRM (`contacts.tags`) e as etiquetas NATIVAS do
// app do WhatsApp (resolvidas via `whatsapp_labels`, populadas pelos eventos
// LabelEdit/LabelAssociationChat do webhook — ver core/webhook.ts).
const BLOCKED_TAGS = ['jonathan', 'loja']

export function isContactBlockedByTags(
  crmTags: string[] | null | undefined,
  whatsappLabelNames?: string[] | null | undefined
): boolean {
  const combined = [...(crmTags ?? []), ...(whatsappLabelNames ?? [])].map((t) => t.toLowerCase())
  if (combined.length === 0) return false
  return BLOCKED_TAGS.every((t) => combined.includes(t))
}
