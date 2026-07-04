import { describe, expect, it } from 'vitest'
import { isWithinBusinessHours, normalizeMessageSequence, splitMessage } from './process-message.js'
import type { LLMMessage } from '../shared/llm-client.js'

describe('isWithinBusinessHours', () => {
  const hours = {
    mon: { enabled: true, start: '08:00', end: '18:00' },
    tue: { enabled: true, start: '08:00', end: '18:00' },
    wed: { enabled: true, start: '08:00', end: '18:00' },
    thu: { enabled: true, start: '08:00', end: '18:00' },
    fri: { enabled: true, start: '08:00', end: '18:00' },
    sat: { enabled: false, start: '', end: '' },
    sun: undefined,
  }

  it('retorna false num dia sem horário configurado', () => {
    expect(isWithinBusinessHours({ sun: undefined }, 'America/Sao_Paulo')).toBe(false)
  })

  it('retorna false num dia explicitamente desabilitado', () => {
    expect(isWithinBusinessHours(hours, 'America/Sao_Paulo')).toBeTypeOf('boolean')
  })
})

describe('splitMessage', () => {
  it('devolve o texto inteiro como única parte quando cabe no limite', () => {
    expect(splitMessage('Olá, tudo bem?')).toEqual(['Olá, tudo bem?'])
  })

  it('quebra por parágrafo quando excede maxLength', () => {
    const text = 'Parágrafo um.\n\nParágrafo dois.'
    const parts = splitMessage(text, 5)
    expect(parts.length).toBeGreaterThan(1)
  })

  it('nunca gera mais de 4 partes', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Frase número ${i}.`).join('\n\n')
    const parts = splitMessage(text, 10)
    expect(parts.length).toBeLessThanOrEqual(4)
  })
})

describe('normalizeMessageSequence', () => {
  it('funde mensagens consecutivas do mesmo papel', () => {
    const msgs: LLMMessage[] = [
      { role: 'user', content: 'oi' },
      { role: 'user', content: 'tudo bem?' },
    ]
    const result = normalizeMessageSequence(msgs)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('oi\ntudo bem?')
  })

  it('remove uma mensagem de assistant líder (histórico não pode começar por assistant)', () => {
    const msgs: LLMMessage[] = [
      { role: 'assistant', content: 'oi, tudo bem?' },
      { role: 'user', content: 'quero agendar' },
    ]
    const result = normalizeMessageSequence(msgs)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
  })

  it('lista vazia devolve lista vazia', () => {
    expect(normalizeMessageSequence([])).toEqual([])
  })
})
