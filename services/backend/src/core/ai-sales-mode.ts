// Decide, a cada mensagem, se a IA atua como VENDEDORA (conduz até o fechamento) ou como
// SDR (qualifica o lead e passa pro vendedor). Função pura — toda a leitura de banco fica
// no chamador (process-message.ts), pra ser testável sem banco.

export type AiSalesModeSetting = 'auto' | 'seller' | 'sdr'
export type AiSalesMode = 'seller' | 'sdr'

export interface AiSalesModeInput {
  /** tenants.ai_sales_mode (qualquer valor desconhecido é tratado como 'auto'). */
  setting: string | null | undefined
  /** Vendedores (users.role = 'operator') ativos, online ou não. */
  registeredVendors: number
  /** Vendedores ativos marcados como online (is_available = true). */
  onlineVendors: number
  withinBusinessHours: boolean
  /**
   * A IA já assumiu o fechamento desta conversa (conversations.autonomous_mode) — não volta
   * pra SDR no meio da negociação só porque um vendedor ficou online.
   */
  conversationInAutonomousClosing: boolean
}

export function normalizeAiSalesModeSetting(setting: string | null | undefined): AiSalesModeSetting {
  return setting === 'seller' || setting === 'sdr' ? setting : 'auto'
}

export function resolveAiSalesMode(input: AiSalesModeInput): AiSalesMode {
  const setting = normalizeAiSalesModeSetting(input.setting)

  // Sem equipe de vendas não há pra quem passar o lead — sempre vendedora.
  if (input.registeredVendors <= 0) return 'seller'
  if (setting === 'seller') return 'seller'
  if (setting === 'sdr') return 'sdr'

  // auto
  if (input.conversationInAutonomousClosing) return 'seller'
  if (input.withinBusinessHours && input.onlineVendors > 0) return 'sdr'
  return 'seller'
}
