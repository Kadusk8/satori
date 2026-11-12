// Preço por perfil de compra (empresas com tenants.price_types_enabled = true).
//
// Regra de quantidade (a mesma do prompt e das orientações da Imaginarium):
//   Varejo  = 1 a 9 peças
//   Atacado = 10 a 29 peças
//   Revenda = 30 peças ou mais
// Quantidade = total de peças do pedido, somando todos os modelos.
//
// Módulo sem dependências, pra ser testável sem banco.

export type PriceProfile = 'varejo' | 'atacado' | 'revenda'

export const PROFILE_LABEL: Record<PriceProfile, string> = {
  varejo: 'Varejo',
  atacado: 'Atacado',
  revenda: 'Revenda',
}

export const ATACADO_MIN_QTY = 10
export const REVENDA_MIN_QTY = 30

export interface ProfilePrices {
  /** Varejo (coluna `price`). */
  price: number | string | null
  price_wholesale: number | string | null
  price_reseller: number | string | null
}

export function profileForQuantity(quantity: number): PriceProfile {
  if (quantity >= REVENDA_MIN_QTY) return 'revenda'
  if (quantity >= ATACADO_MIN_QTY) return 'atacado'
  return 'varejo'
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function priceForProfile(p: ProfilePrices, profile: PriceProfile): number | null {
  if (profile === 'revenda') return toNumber(p.price_reseller)
  if (profile === 'atacado') return toNumber(p.price_wholesale)
  return toNumber(p.price)
}

export function formatBRL(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

/** Quantidade informada pela IA → inteiro >= 1, ou null se ausente/inválida. */
export function parseQuantity(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isFinite(n)) return null
  const q = Math.floor(n)
  return q >= 1 ? q : null
}

/** Linha de preço do card/legenda: só o preço do perfil da quantidade; sem quantidade, sem preço. */
export function captionPriceLine(p: ProfilePrices, quantity: number | null): string {
  if (quantity === null) return ''
  const profile = profileForQuantity(quantity)
  const value = priceForProfile(p, profile)
  if (value === null) return ''
  return `💰 ${formatBRL(value)} (${PROFILE_LABEL[profile]})`
}

/**
 * Bloco de preços pro resultado de busca/contexto da IA: os três valores e a regra de escolha.
 * Preço não cadastrado vira "não cadastrado" (a IA não pode inventar).
 */
export function profilePricesBlock(p: ProfilePrices): string {
  const fmt = (v: number | string | null) => {
    const n = toNumber(v)
    return n === null ? 'não cadastrado' : formatBRL(n)
  }
  return [
    `💰 Preços por perfil — Varejo (1 a ${ATACADO_MIN_QTY - 1} peças): ${fmt(p.price)} | Atacado (${ATACADO_MIN_QTY} a ${REVENDA_MIN_QTY - 1} peças): ${fmt(p.price_wholesale)} | Revenda (${REVENDA_MIN_QTY} peças ou mais): ${fmt(p.price_reseller)}.`,
    `REGRA DE PREÇO: o valor depende da quantidade TOTAL de peças do pedido (todos os modelos somados). Se o cliente ainda não disse a quantidade, pergunte antes de falar preço. Informe SÓ o preço do perfil dele (não liste os outros, a menos que ele peça). Se o preço desse perfil estiver "não cadastrado", NÃO invente: diga que vai confirmar o valor com a equipe e use escalate_to_human.`,
  ].join('\n')
}
