import { describe, expect, it } from 'vitest'
import { normalizeAiSalesModeSetting, resolveAiSalesMode, type AiSalesModeInput } from './ai-sales-mode.js'

const base: AiSalesModeInput = {
  setting: 'auto',
  registeredVendors: 2,
  onlineVendors: 1,
  withinBusinessHours: true,
  conversationInAutonomousClosing: false,
}

describe('resolveAiSalesMode', () => {
  it('sem vendedores cadastrados é sempre vendedora, mesmo com sdr forçado', () => {
    expect(resolveAiSalesMode({ ...base, registeredVendors: 0, onlineVendors: 0 })).toBe('seller')
    expect(resolveAiSalesMode({ ...base, setting: 'sdr', registeredVendors: 0, onlineVendors: 0 })).toBe('seller')
  })

  it('auto: vendedor online dentro do horário → SDR', () => {
    expect(resolveAiSalesMode(base)).toBe('sdr')
  })

  it('auto: ninguém online → vendedora', () => {
    expect(resolveAiSalesMode({ ...base, onlineVendors: 0 })).toBe('seller')
  })

  it('auto: fora do horário → vendedora, mesmo com vendedor online', () => {
    expect(resolveAiSalesMode({ ...base, withinBusinessHours: false })).toBe('seller')
  })

  it('auto: conversa já em fechamento autônomo não volta pra SDR', () => {
    expect(resolveAiSalesMode({ ...base, conversationInAutonomousClosing: true })).toBe('seller')
  })

  it('seller forçado ignora disponibilidade e horário', () => {
    expect(resolveAiSalesMode({ ...base, setting: 'seller' })).toBe('seller')
  })

  it('sdr forçado vale mesmo sem ninguém online e fora do horário', () => {
    expect(resolveAiSalesMode({ ...base, setting: 'sdr', onlineVendors: 0, withinBusinessHours: false })).toBe('sdr')
  })

  it('valor desconhecido é tratado como auto', () => {
    expect(normalizeAiSalesModeSetting('xyz')).toBe('auto')
    expect(normalizeAiSalesModeSetting(null)).toBe('auto')
    expect(resolveAiSalesMode({ ...base, setting: 'xyz' })).toBe('sdr')
  })
})
