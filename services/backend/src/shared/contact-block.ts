// Trava configurável por tenant: contatos com QUALQUER uma das etiquetas
// cadastradas em tenants.blocked_labels nunca recebem mensagem automática —
// nem resposta da IA, nem follow-up, nem lembrete. Combina duas fontes de
// etiqueta do contato: tags do CRM (contacts.tags) e etiquetas nativas do
// WhatsApp (resolvidas via whatsapp_labels). Comparação em minúsculas.
export function isContactBlockedByTags(
  blockedLabels: string[] | null | undefined,
  crmTags: string[] | null | undefined,
  whatsappLabelNames?: string[] | null | undefined
): boolean {
  const blocked = (blockedLabels ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean)
  if (blocked.length === 0) return false
  const contactLabels = [...(crmTags ?? []), ...(whatsappLabelNames ?? [])].map((t) => t.toLowerCase().trim())
  return blocked.some((b) => contactLabels.includes(b))
}
