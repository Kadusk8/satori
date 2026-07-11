import { describe, expect, it } from 'vitest'
import {
  extractCustomerKeywords,
  extractFocusProductCandidate,
  isMoreImagesIntent,
  isWithinBusinessHours,
  normalizeMessageSequence,
  splitMessage,
} from './process-message.js'
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

describe('extractCustomerKeywords', () => {
  it('remove stopwords e palavras curtas', () => {
    expect(extractCustomerKeywords('quero ver o corolla por favor')).toEqual(['corolla'])
  })

  it('preserva acentos e ignora pontuação', () => {
    expect(extractCustomerKeywords('tem colchão de casal?')).toEqual(['colchão', 'casal'])
  })

  it('conteúdo vazio ou nulo devolve lista vazia', () => {
    expect(extractCustomerKeywords(null)).toEqual([])
    expect(extractCustomerKeywords('')).toEqual([])
  })
})

describe('isMoreImagesIntent', () => {
  it('detecta pedidos comuns de mais fotos', () => {
    for (const msg of [
      'tem mais fotos do fox?',
      'Me manda mais fotos do fox',
      'manda todas as fotos',
      'quero ver mais imagens',
      'tem outros ângulos?',
      'quero ver por dentro',
      'me mostra o interior',
    ]) {
      expect(isMoreImagesIntent(msg), msg).toBe(true)
    }
  })

  it('não dispara pra pedidos que não são de fotos', () => {
    for (const msg of [
      'quero ver mais opções',
      'tem carro mais barato?',
      'qual o preço?',
      'gostei, quero comprar',
      null,
      '',
    ]) {
      expect(isMoreImagesIntent(msg), String(msg)).toBe(false)
    }
  })
})

describe('extractFocusProductCandidate', () => {
  const baseMsg = {
    id: '1',
    sender_type: 'ai',
    content: 'texto',
    content_type: 'text',
    media_url: null,
    created_at: new Date(),
  }

  it('prioriza o último send_product_image bem-sucedido', () => {
    const history = [
      {
        ...baseMsg,
        id: '1',
        ai_tool_calls: [
          { name: 'search_products', input: {}, result: '📦 *Fox*\n...\nID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        ],
      },
      {
        ...baseMsg,
        id: '2',
        ai_tool_calls: [
          { name: 'send_product_image', input: { product_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, result: 'ok' },
        ],
      },
    ]
    expect(extractFocusProductCandidate(history)).toEqual({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  })

  it('ignora tentativas de imagem que falharam ("Produto não encontrado")', () => {
    const history = [
      {
        ...baseMsg,
        id: '1',
        ai_tool_calls: [
          { name: 'send_more_product_images', input: { product_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }, result: 'Produto não encontrado.' },
        ],
      },
    ]
    expect(extractFocusProductCandidate(history)).toBeNull()
  })

  it('cai pro fallback de search_products quando não há tool de imagem bem-sucedida', () => {
    const history = [
      {
        ...baseMsg,
        id: '1',
        ai_tool_calls: [
          { name: 'search_products', input: {}, result: '📦 *HB20*\n...\nID: cccccccc-cccc-cccc-cccc-cccccccccccc' },
        ],
      },
    ]
    expect(extractFocusProductCandidate(history)).toEqual({ name: 'HB20', id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })
  })

  it('histórico sem ai_tool_calls devolve null', () => {
    const history = [{ ...baseMsg, ai_tool_calls: null }]
    expect(extractFocusProductCandidate(history)).toBeNull()
  })
})
