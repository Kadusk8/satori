// Modo de atuação da IA por tenant (tenants.ai_sales_mode). A decisão real, por mensagem,
// fica no backend: services/backend/src/core/ai-sales-mode.ts.

export const AI_SALES_MODES = ['auto', 'seller', 'sdr'] as const
export type AiSalesModeSetting = (typeof AI_SALES_MODES)[number]

export const AI_SALES_MODE_LABELS = {
  auto: 'Automático',
  seller: 'IA vende',
  sdr: 'IA qualifica (SDR)',
} satisfies Record<AiSalesModeSetting, string>

export const AI_SALES_MODE_DESCRIPTIONS = {
  auto: 'Com vendedor online no horário, a IA qualifica e passa. Sem ninguém online ou fora do horário, ela vende.',
  seller: 'A IA atende e conduz até o fechamento, mesmo com vendedores online.',
  sdr: 'A IA só qualifica e passa pro vendedor — nunca fecha. Sem ninguém online, o lead fica aguardando.',
} satisfies Record<AiSalesModeSetting, string>

export function normalizeAiSalesMode(value: unknown): AiSalesModeSetting {
  return value === 'seller' || value === 'sdr' ? value : 'auto'
}
