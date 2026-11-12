import { describe, expect, it } from 'vitest'
import { captionPriceLine, parseQuantity, priceForProfile, profileForQuantity, profilePricesBlock } from './price-profile.js'

const nike = { price: '80.00', price_wholesale: '65.00', price_reseller: '59.90' }

describe('profileForQuantity — limites da regra 1–9 / 10–29 / 30+', () => {
  it.each([
    [1, 'varejo'], [3, 'varejo'], [9, 'varejo'],
    [10, 'atacado'], [20, 'atacado'], [29, 'atacado'],
    [30, 'revenda'], [31, 'revenda'], [50, 'revenda'], [500, 'revenda'],
  ])('%i peças → %s', (q, expected) => {
    expect(profileForQuantity(q)).toBe(expected)
  })
})

describe('priceForProfile', () => {
  it('devolve o preço da coluna certa (aceita string do Postgres numeric)', () => {
    expect(priceForProfile(nike, 'varejo')).toBe(80)
    expect(priceForProfile(nike, 'atacado')).toBe(65)
    expect(priceForProfile(nike, 'revenda')).toBe(59.9)
  })
  it('preço não cadastrado → null (nunca 0)', () => {
    expect(priceForProfile({ price: null, price_wholesale: '24.00', price_reseller: null }, 'varejo')).toBeNull()
    expect(priceForProfile({ price: null, price_wholesale: '24.00', price_reseller: null }, 'revenda')).toBeNull()
    expect(priceForProfile({ price: '', price_wholesale: null, price_reseller: null }, 'varejo')).toBeNull()
  })
})

describe('captionPriceLine', () => {
  it('sem quantidade não mostra preço', () => {
    expect(captionPriceLine(nike, null)).toBe('')
  })
  it('mostra só o preço do perfil, com rótulo', () => {
    expect(captionPriceLine(nike, 3)).toBe('💰 R$ 80,00 (Varejo)')
    expect(captionPriceLine(nike, 15)).toBe('💰 R$ 65,00 (Atacado)')
    expect(captionPriceLine(nike, 30)).toBe('💰 R$ 59,90 (Revenda)')
  })
  it('perfil sem preço cadastrado não mostra linha', () => {
    expect(captionPriceLine({ price: null, price_wholesale: '24', price_reseller: '22' }, 2)).toBe('')
  })
})

describe('parseQuantity', () => {
  it('aceita número e texto numérico; rejeita lixo e < 1', () => {
    expect(parseQuantity(12)).toBe(12)
    expect(parseQuantity('30')).toBe(30)
    expect(parseQuantity(9.9)).toBe(9)
    expect(parseQuantity(0)).toBeNull()
    expect(parseQuantity(-4)).toBeNull()
    expect(parseQuantity('muitas')).toBeNull()
    expect(parseQuantity(undefined)).toBeNull()
    expect(parseQuantity(null)).toBeNull()
  })
})

describe('profilePricesBlock', () => {
  it('lista os 3 preços com as faixas e a regra de escolha', () => {
    const b = profilePricesBlock(nike)
    expect(b).toContain('Varejo (1 a 9 peças): R$ 80,00')
    expect(b).toContain('Atacado (10 a 29 peças): R$ 65,00')
    expect(b).toContain('Revenda (30 peças ou mais): R$ 59,90')
    expect(b).toContain('pergunte antes de falar preço')
  })
  it('marca "não cadastrado" no que faltar', () => {
    expect(profilePricesBlock({ price: null, price_wholesale: '24', price_reseller: '22' })).toContain('Varejo (1 a 9 peças): não cadastrado')
  })
})
