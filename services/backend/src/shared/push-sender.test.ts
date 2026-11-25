import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────
const { sendNotification, setVapidDetails, FakeWebPushError, ctx } = vi.hoisted(() => {
  class FakeWebPushError extends Error {
    constructor(public statusCode: number, public body = '') {
      super(`push ${statusCode}`)
    }
  }
  return {
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    FakeWebPushError,
    ctx: {
      prefs: [] as Array<{ userId: string; onlyAssigned: boolean; quietStart: string | null; quietEnd: string | null }>,
      subs: [] as Array<{ endpoint: string; keysP256dh: string; keysAuth: string }>,
      waiting: 0,
      deleted: [] as string[],
      subsQueriedFor: [] as string[][],
    },
  }
})

vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails, WebPushError: FakeWebPushError },
}))

vi.mock('./push-context.js', () => ({
  loadRecipientPrefs: async (_t: string, ids: string[]) => ctx.prefs.filter((p) => ids.includes(p.userId)),
  loadTenantTimezone: async () => 'America/Sao_Paulo',
  countWaitingConversations: async () => ctx.waiting,
  loadSubscriptions: async (_t: string, ids: string[]) => {
    ctx.subsQueriedFor.push(ids)
    return ctx.subs
  },
  deleteSubscription: async (endpoint: string) => {
    ctx.deleted.push(endpoint)
  },
}))

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keysP256dh: 'p', keysAuth: 'a' }
const CONV = '123e4567-e89b-12d3-a456-426614174000'
const NOON_SP = new Date('2026-11-25T15:00:00Z')
const pref = (userId: string, extra: Partial<(typeof ctx.prefs)[number]> = {}) => ({
  userId, onlyAssigned: false, quietStart: null, quietEnd: null, ...extra,
})

async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return import('./push-sender.js')
}

const FULL_ENV = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:suporte@satori.ia.br' }

beforeEach(() => {
  sendNotification.mockReset()
  setVapidDetails.mockReset()
  ctx.prefs = [pref('u1')]
  ctx.subs = [SUB]
  ctx.waiting = 0
  ctx.deleted = []
  ctx.subsQueriedFor = []
})

describe('buildSendOptions', () => {
  it('escalada: urgência alta e 24h de validade', async () => {
    const { buildSendOptions } = await load(FULL_ENV)
    expect(buildSendOptions({ title: 't', body: 'b', kind: 'escalation', conversationId: CONV })).toEqual({
      TTL: 86400,
      urgency: 'high',
      topic: '123e4567e89b12d3a456426614174000',
    })
  })

  it('mensagem comum: urgência normal e 1h', async () => {
    const { buildSendOptions } = await load(FULL_ENV)
    expect(buildSendOptions({ title: 't', body: 'b', kind: 'message' })).toEqual({ TTL: 3600, urgency: 'normal' })
  })

  it('topic inválido (mais de 32 chars) é omitido em vez de quebrar o envio', async () => {
    const { buildSendOptions } = await load(FULL_ENV)
    const opts = buildSendOptions({ title: 't', body: 'b', kind: 'message', conversationId: 'x'.repeat(40) })
    expect(opts.topic).toBeUndefined()
  })
})

describe('sendPushNotification', () => {
  it('sem chave privada não configura nem envia', async () => {
    const { sendPushNotification } = await load({ ...FULL_ENV, VAPID_PRIVATE_KEY: undefined })
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(setVapidDetails).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sem VAPID_SUBJECT usa o padrão do domínio Satori (deploy sem a env nova não derruba o push)', async () => {
    const { sendPushNotification } = await load({ ...FULL_ENV, VAPID_SUBJECT: undefined })
    sendNotification.mockResolvedValue({})
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' }, { now: NOON_SP })
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:suporte@satori.ia.br', 'pub', 'priv')
  })

  it('VAPID_SUBJECT malformado desativa o envio em vez de tomar 403 da Apple', async () => {
    const { sendPushNotification } = await load({ ...FULL_ENV, VAPID_SUBJECT: 'suporte@satori.ia.br' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(sendNotification).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('envia sem o campo kind e com o contador de conversas esperando (badge)', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    sendNotification.mockResolvedValue({})
    ctx.waiting = 3
    await sendPushNotification('t1', ['u1'], { title: 'Oi', body: 'b', kind: 'escalation', conversationId: CONV }, { now: NOON_SP })
    const [, payload, options] = sendNotification.mock.calls[0]
    expect(JSON.parse(payload)).toEqual({ title: 'Oi', body: 'b', conversationId: CONV, badge: 3 })
    expect(options).toMatchObject({ urgency: 'high' })
  })

  it('lista de usuários vazia não consulta nem envia', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    await sendPushNotification('t1', [], { title: 't', body: 'b', kind: 'message' })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('aplica preferências antes de buscar inscrições', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    sendNotification.mockResolvedValue({})
    ctx.prefs = [
      pref('dono'),
      pref('so-minhas', { onlyAssigned: true }),
      pref('almoco', { quietStart: '11:00:00', quietEnd: '13:00:00' }),
    ]
    await sendPushNotification('t1', ['dono', 'so-minhas', 'almoco'], { title: 't', body: 'b', kind: 'message' }, {
      assignedUserId: null,
      now: NOON_SP,
    })
    expect(ctx.subsQueriedFor).toEqual([['dono']])
  })

  it('todos filtrados pelas preferências: não envia nada', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    ctx.prefs = [pref('u1', { onlyAssigned: true })]
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' }, { now: NOON_SP })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(ctx.subsQueriedFor).toEqual([])
  })

  it.each([404, 410])('%i remove a inscrição', async (status) => {
    const { sendPushNotification } = await load(FULL_ENV)
    sendNotification.mockRejectedValue(new FakeWebPushError(status))
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' }, { now: NOON_SP })
    expect(ctx.deleted).toEqual([SUB.endpoint])
  })

  it('403 (VAPID errado) não remove a inscrição e loga o motivo', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendNotification.mockRejectedValue(new FakeWebPushError(403, 'BadJwtToken'))
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' }, { now: NOON_SP })
    expect(ctx.deleted).toHaveLength(0)
    expect(spy.mock.calls[0][0]).toContain('403')
    expect(spy.mock.calls[0][0]).toContain('BadJwtToken')
    spy.mockRestore()
  })
})
