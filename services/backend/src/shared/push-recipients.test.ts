import { describe, expect, it } from 'vitest'
import { messagePushRecipients } from './push-recipients.js'

const ACTIVE = ['owner', 'admin', 'op1', 'op2']

describe('messagePushRecipients', () => {
  it('IA atendendo sem dono: ninguém recebe (era push a cada mensagem pro dono/admin)', () => {
    expect(messagePushRecipients({ assignedTo: null, conversationStatus: 'ai_handling', activeUserIds: ACTIVE })).toEqual([])
  })

  it('esperando humano sem dono: todos os ativos', () => {
    expect(messagePushRecipients({ assignedTo: null, conversationStatus: 'waiting_human', activeUserIds: ACTIVE })).toEqual(ACTIVE)
  })

  it('em atendimento humano sem dono: todos os ativos', () => {
    expect(messagePushRecipients({ assignedTo: null, conversationStatus: 'human_handling', activeUserIds: ACTIVE })).toEqual(ACTIVE)
  })

  it('com dono: só o dono, qualquer que seja o status', () => {
    expect(messagePushRecipients({ assignedTo: 'op1', conversationStatus: 'ai_handling', activeUserIds: ACTIVE })).toEqual(['op1'])
    expect(messagePushRecipients({ assignedTo: 'op1', conversationStatus: 'waiting_human', activeUserIds: ACTIVE })).toEqual(['op1'])
  })

  it('dono desativado não recebe — nem cai pros outros', () => {
    expect(messagePushRecipients({ assignedTo: 'ex-vendedor', conversationStatus: 'waiting_human', activeUserIds: ACTIVE })).toEqual([])
  })

  it('status desconhecido/encerrado sem dono: ninguém', () => {
    expect(messagePushRecipients({ assignedTo: null, conversationStatus: 'closed', activeUserIds: ACTIVE })).toEqual([])
    expect(messagePushRecipients({ assignedTo: undefined, conversationStatus: null, activeUserIds: ACTIVE })).toEqual([])
  })

  it('não devolve a mesma referência do array de entrada', () => {
    const out = messagePushRecipients({ assignedTo: null, conversationStatus: 'waiting_human', activeUserIds: ACTIVE })
    expect(out).not.toBe(ACTIVE)
  })
})
