import { describe, expect, it } from 'vitest'
import { shouldReplaceDeferredImage, stripImagePlaceholders } from './turn-guards.js'

describe('shouldReplaceDeferredImage', () => {
  it('primeira foto do turno sempre vale', () => {
    expect(shouldReplaceDeferredImage(false, 'zara', null)).toBe(true)
    expect(shouldReplaceDeferredImage(false, 'zara', 'bermuda')).toBe(true)
  })
  it('foto seguinte só substitui se for o top da busca mais recente', () => {
    expect(shouldReplaceDeferredImage(true, 'bermuda', 'bermuda')).toBe(true)
    expect(shouldReplaceDeferredImage(true, 'peruanas', 'zara')).toBe(false)
    expect(shouldReplaceDeferredImage(true, 'gola-polo', 'zara')).toBe(false)
  })
  it('sem busca no turno, não troca a foto já escolhida', () => {
    expect(shouldReplaceDeferredImage(true, 'zara', null)).toBe(false)
  })
})

describe('stripImagePlaceholders', () => {
  it('remove marcadores de imagem/foto escritos como texto', () => {
    expect(stripImagePlaceholders('Olha só 👇\n\n[Ver imagem da Camiseta Zara]')).toBe('Olha só 👇')
    expect(stripImagePlaceholders('Segue: [imagem da camiseta zara] bonita')).toBe('Segue:  bonita')
    expect(stripImagePlaceholders('[foto]')).toBe('')
    expect(stripImagePlaceholders('[Imagens do produto] ok')).toBe('ok')
  })
  it('não mexe em colchetes que não falam de imagem', () => {
    expect(stripImagePlaceholders('Tamanho [2 a 16 anos] disponível')).toBe('Tamanho [2 a 16 anos] disponível')
    expect(stripImagePlaceholders('Veja [fotografia profissional]')).toBe('Veja [fotografia profissional]')
  })
  it('texto sem marcador passa intacto', () => {
    expect(stripImagePlaceholders('Cada camiseta custa R$ 50,00.')).toBe('Cada camiseta custa R$ 50,00.')
  })
})
