import { describe, expect, it } from 'vitest'
import {
  extractCustomerKeywords,
  extractFocusProductCandidate,
  isMoreImagesIntent,
  isPureGreeting,
  isReturningAfterGap,
  isWithinBusinessHours,
  matchAdReferralProduct,
  normalizeMessageSequence,
  splitMessage,
} from './process-message.js'
import type { LLMMessage } from '../shared/llm-client.js'

describe('isReturningAfterGap', () => {
  const GAP = 3 * 60 * 60 * 1000
  const msg = (id: string, iso: string) =>
    ({ id, sender_type: 'customer', content: id, content_type: 'text', media_url: null, ai_tool_calls: null, created_at: new Date(iso) }) as Parameters<typeof isReturningAfterGap>[0][number]

  it('detecta retomada quando a última mensagem vem após um gap grande', () => {
    // conversa antiga (dia 11) + "boa tarde" 3 dias depois (dia 14)
    const history = [
      msg('a', '2026-07-11T20:00:00Z'),
      msg('b', '2026-07-11T20:05:00Z'),
      msg('boa-tarde', '2026-07-14T19:10:00Z'),
    ]
    expect(isReturningAfterGap(history, GAP)).toBe(true)
  })

  it('não sinaliza retomada em conversa contínua', () => {
    const history = [
      msg('a', '2026-07-14T19:00:00Z'),
      msg('b', '2026-07-14T19:10:00Z'),
      msg('c', '2026-07-14T19:20:00Z'),
    ]
    expect(isReturningAfterGap(history, GAP)).toBe(false)
  })

  it('histórico com menos de 2 mensagens não é retomada', () => {
    expect(isReturningAfterGap([], GAP)).toBe(false)
    expect(isReturningAfterGap([msg('só', '2026-07-14T10:00:00Z')], GAP)).toBe(false)
  })
})

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

describe('isPureGreeting', () => {
  it('detecta saudações puras, sem mais nada na mensagem', () => {
    for (const msg of ['boa noite', 'Boa noite!', 'oi', 'Oi!', 'olá', 'ola', 'e aí', 'eae', 'bom dia', 'boa tarde', 'tudo bem?', 'blz', 'beleza', 'opa']) {
      expect(isPureGreeting(msg), msg).toBe(true)
    }
  })

  it('não dispara quando a mensagem tem pedido junto com a saudação', () => {
    for (const msg of [
      'boa tarde, tem fox?',
      'oi, quero ver um carro',
      'bom dia, qual o preço?',
      'boa noite, vocês têm SUV?',
      null,
      '',
    ]) {
      expect(isPureGreeting(msg), String(msg)).toBe(false)
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

describe('matchAdReferralProduct', () => {
  const adProducts = [
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'VW Fox Connect 1.6' },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Honda Civic 2020' },
  ]

  it('acha o produto quando o título do anúncio contém o nome exato', () => {
    const result = matchAdReferralProduct({ title: 'VW Fox Connect 1.6', body: null }, adProducts)
    expect(result?.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  })

  it('acha por match parcial de palavras significativas no corpo do anúncio', () => {
    const result = matchAdReferralProduct(
      { title: 'Promoção de carros', body: 'Confira o Honda Civic com condições especiais' },
      adProducts
    )
    expect(result?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  })

  it('devolve null quando não há match com nenhum produto em anúncio', () => {
    const result = matchAdReferralProduct({ title: 'Promoção geral', body: 'Confira nossos carros' }, adProducts)
    expect(result).toBeNull()
  })

  it('devolve null quando o referral não tem título nem corpo', () => {
    expect(matchAdReferralProduct({ title: null, body: null }, adProducts)).toBeNull()
  })
})
