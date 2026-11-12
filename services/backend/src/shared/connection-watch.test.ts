import { describe, expect, it, vi } from 'vitest'
import { createConnectionWatcher, type WatchDeps } from './connection-watch.js'

function setup(overrides: Partial<WatchDeps> = {}) {
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = []
  const deps: WatchDeps = {
    graceMs: 150_000,
    retryWaitMs: 20_000,
    checkStatus: vi.fn().mockResolvedValue(false),
    reconnect: vi.fn().mockResolvedValue(undefined),
    setFlag: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockResolvedValue(undefined),
    schedule: (fn, ms) => {
      const t = { fn, ms, cancelled: false }
      timers.push(t)
      return t
    },
    cancel: (h) => {
      ;(h as { cancelled: boolean }).cancelled = true
    },
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  const w = createConnectionWatcher(deps)
  const fire = async () => {
    const t = timers.find((x) => !x.cancelled)
    if (!t) throw new Error('nenhum timer ativo')
    t.cancelled = true
    t.fn()
    await new Promise((r) => setImmediate(r))
  }
  return { w, deps, timers, fire }
}

describe('createConnectionWatcher', () => {
  it('desconexão agenda UMA espera, mesmo com vários eventos seguidos (oscilação)', async () => {
    const { w, timers } = setup()
    await w.onEvent('t1', 'disconnected')
    await w.onEvent('t1', 'disconnected')
    await w.onEvent('t1', 'disconnected')
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(150_000)
  })

  it('voltou durante a espera: cancela, não reconecta nem avisa', async () => {
    const { w, deps, timers } = setup()
    await w.onEvent('t1', 'disconnected')
    await w.onEvent('t1', 'connected')
    expect(timers[0].cancelled).toBe(true)
    expect(deps.reconnect).not.toHaveBeenCalled()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('fim da espera já conectada: só corrige o status, sem reconectar', async () => {
    const { w, deps, fire } = setup({ checkStatus: vi.fn().mockResolvedValue(true) })
    await w.onEvent('t1', 'disconnected')
    await fire()
    expect(deps.setFlag).toHaveBeenCalledWith('t1', true)
    expect(deps.reconnect).not.toHaveBeenCalled()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('fim da espera fora: reconecta; se voltar, marca conectado e não avisa', async () => {
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { w, deps, fire } = setup({ checkStatus: check })
    await w.onEvent('t1', 'disconnected')
    await fire()
    expect(deps.reconnect).toHaveBeenCalledWith('t1')
    expect(deps.setFlag).toHaveBeenCalledWith('t1', true)
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('reconectou e continua fora: avisa "not_recovered" uma vez; novas quedas não repetem o aviso', async () => {
    const { w, deps, fire, timers } = setup()
    await w.onEvent('t1', 'disconnected')
    await fire()
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.notify).toHaveBeenCalledWith('t1', 'not_recovered', undefined)
    await w.onEvent('t1', 'disconnected')
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0)
    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it('erro ao checar (ex: token inválido) também avisa, com o detalhe', async () => {
    const { w, deps, fire } = setup({ checkStatus: vi.fn().mockRejectedValue(new Error('401 not authorized')) })
    await w.onEvent('t1', 'disconnected')
    await fire()
    expect(deps.notify).toHaveBeenCalledWith('t1', 'not_recovered', '401 not authorized')
  })

  it('depois do aviso, "connected" manda o aviso de recuperação e rearma', async () => {
    const { w, deps, fire, timers } = setup()
    await w.onEvent('t1', 'disconnected')
    await fire()
    await w.onEvent('t1', 'connected')
    expect(deps.notify).toHaveBeenLastCalledWith('t1', 'recovered', undefined)
    await w.onEvent('t1', 'disconnected')
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(1)
  })

  it('logged_out avisa na hora (uma vez) e cancela a espera pendente', async () => {
    const { w, deps, timers } = setup()
    await w.onEvent('t1', 'disconnected')
    await w.onEvent('t1', 'logged_out')
    await w.onEvent('t1', 'logged_out')
    expect(timers[0].cancelled).toBe(true)
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.notify).toHaveBeenCalledWith('t1', 'logged_out', undefined)
    expect(deps.reconnect).not.toHaveBeenCalled()
  })

  it('tenants são independentes', async () => {
    const { w, timers } = setup()
    await w.onEvent('a', 'disconnected')
    await w.onEvent('b', 'disconnected')
    expect(timers).toHaveLength(2)
  })

  it('falha ao enviar o aviso não derruba o fluxo', async () => {
    const { w, fire } = setup({ notify: vi.fn().mockRejectedValue(new Error('resend fora')), log: () => {} })
    await w.onEvent('t1', 'disconnected')
    await expect(fire()).resolves.toBeUndefined()
  })
})
