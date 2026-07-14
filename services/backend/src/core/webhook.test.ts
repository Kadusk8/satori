import { describe, expect, it } from 'vitest'
import { extractAdReferral } from './webhook.js'

describe('extractAdReferral', () => {
  it('extrai título, corpo e origem de um referral de anúncio via extendedTextMessage', () => {
    const data = {
      Message: {
        extendedTextMessage: {
          text: 'Quero saber mais sobre esse carro',
          contextInfo: {
            externalAdReply: {
              title: 'VW Fox Connect 1.6',
              body: 'A partir de R$ 61.900',
              sourceID: 'ad-123',
              sourceURL: 'https://fb.me/ad-123',
              ctwaClid: 'clid-abc',
            },
          },
        },
      },
    }
    expect(extractAdReferral(data)).toEqual({
      title: 'VW Fox Connect 1.6',
      body: 'A partir de R$ 61.900',
      sourceId: 'ad-123',
      sourceUrl: 'https://fb.me/ad-123',
      ctwaClid: 'clid-abc',
    })
  })

  it('extrai referral quando a mensagem inicial é uma imagem (imageMessage)', () => {
    const data = {
      Message: {
        imageMessage: {
          caption: 'Legenda',
          contextInfo: { externalAdReply: { title: 'Honda Civic', body: null } },
        },
      },
    }
    expect(extractAdReferral(data)).toEqual({
      title: 'Honda Civic',
      body: null,
      sourceId: null,
      sourceUrl: null,
      ctwaClid: null,
    })
  })

  it('devolve null quando não há contextInfo', () => {
    expect(extractAdReferral({ Message: { conversation: 'oi' } })).toBeNull()
  })

  it('devolve null quando há contextInfo mas sem externalAdReply (ex: reply comum)', () => {
    const data = {
      Message: {
        extendedTextMessage: {
          text: 'oi',
          contextInfo: {},
        },
      },
    }
    expect(extractAdReferral(data)).toBeNull()
  })

  it('devolve null quando não há Message', () => {
    expect(extractAdReferral({})).toBeNull()
  })
})
