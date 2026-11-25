import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────
const { sendNotification, setVapidDetails, FakeWebPushError, dbState } = vi.hoisted(() => {
  class FakeWebPushError extends Error {
    constructor(public statusCode: number, public body = '') {
      super(`push ${statusCode}`)
    }
  }
  return {
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    FakeWebPushError,
    dbState: { rows: [] as Array<Record<string, string>>, deleted: [] as unknown[] },
  }
})

vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails, WebPushError: FakeWebPushError },
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => dbState.rows }) }),
    delete: () => ({
      where: async (cond: unknown) => {
        dbState.deleted.push(cond)
      },
    }),
  },
}))

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keysP256dh: 'p', keysAuth: 'a' }
const CONV = '123e4567-e89b-12d3-a456-426614174000'

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
  dbState.rows = [SUB]
  dbState.deleted = []
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
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:suporte@satori.ia.br', 'pub', 'priv')
  })

  it('VAPID_SUBJECT malformado desativa o envio em vez de tomar 403 da Apple', async () => {
    const { sendPushNotification } = await load({ ...FULL_ENV, VAPID_SUBJECT: 'suporte@satori.ia.br' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(sendNotification).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('envia com subject configurado e sem o campo kind no payload', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    sendNotification.mockResolvedValue({})
    await sendPushNotification('t1', ['u1'], { title: 'Oi', body: 'b', kind: 'escalation', conversationId: CONV })
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:suporte@satori.ia.br', 'pub', 'priv')
    const [, payload, options] = sendNotification.mock.calls[0]
    expect(JSON.parse(payload)).toEqual({ title: 'Oi', body: 'b', conversationId: CONV })
    expect(options).toMatchObject({ urgency: 'high' })
  })

  it('lista de usuários vazia não consulta nem envia', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    await sendPushNotification('t1', [], { title: 't', body: 'b', kind: 'message' })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it.each([404, 410])('%i remove a inscrição', async (status) => {
    const { sendPushNotification } = await load(FULL_ENV)
    sendNotification.mockRejectedValue(new FakeWebPushError(status))
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(dbState.deleted).toHaveLength(1)
  })

  it('403 (VAPID errado) não remove a inscrição e loga o motivo', async () => {
    const { sendPushNotification } = await load(FULL_ENV)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendNotification.mockRejectedValue(new FakeWebPushError(403, 'BadJwtToken'))
    await sendPushNotification('t1', ['u1'], { title: 't', body: 'b', kind: 'message' })
    expect(dbState.deleted).toHaveLength(0)
    expect(spy.mock.calls[0][0]).toContain('403')
    expect(spy.mock.calls[0][0]).toContain('BadJwtToken')
    spy.mockRestore()
  })
})
