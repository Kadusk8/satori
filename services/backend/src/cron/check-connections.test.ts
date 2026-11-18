import { describe, expect, it, vi } from 'vitest'

// O módulo real importa db/webhook (conexão com o banco); aqui só testamos a função pura.
vi.mock('../db/index.js', () => ({ pool: {} }))
vi.mock('../shared/evolution-client.js', () => ({ getEvolutionClient: vi.fn() }))
vi.mock('../core/webhook.js', () => ({ connectionWatcher: { onEvent: vi.fn() } }))

const { checkConnections } = await import('./check-connections.js')

function makeDeps(tenants: Array<{ id: string; whatsappConnected: boolean }>, status: Record<string, boolean | Error>) {
  return {
    listTenants: vi.fn(async () => tenants),
    isConnected: vi.fn(async (id: string) => {
      const s = status[id]
      if (s instanceof Error) throw s
      return s ?? false
    }),
    setFlag: vi.fn(async () => {}),
    onEvent: vi.fn(async () => {}),
  }
}

describe('checkConnections', () => {
  it('conectada: manda "connected" e não mexe na flag que já está certa', async () => {
    const deps = makeDeps([{ id: 'a', whatsappConnected: true }], { a: true })
    await checkConnections(deps)
    expect(deps.onEvent).toHaveBeenCalledWith('a', 'connected')
    expect(deps.setFlag).not.toHaveBeenCalled()
  })

  it('fora mas flag dizendo conectada: corrige a flag e entrega "disconnected" ao watcher', async () => {
    const deps = makeDeps([{ id: 'a', whatsappConnected: true }], { a: false })
    await checkConnections(deps)
    expect(deps.setFlag).toHaveBeenCalledWith('a', false)
    expect(deps.onEvent).toHaveBeenCalledWith('a', 'disconnected')
  })

  it('voltou e flag dizia desconectada: corrige a flag pra true', async () => {
    const deps = makeDeps([{ id: 'a', whatsappConnected: false }], { a: true })
    await checkConnections(deps)
    expect(deps.setFlag).toHaveBeenCalledWith('a', true)
    expect(deps.onEvent).toHaveBeenCalledWith('a', 'connected')
  })

  it('erro ao checar (Evolution fora) conta como desconectada', async () => {
    const deps = makeDeps([{ id: 'a', whatsappConnected: true }], { a: new Error('ECONNREFUSED') })
    await checkConnections(deps)
    expect(deps.onEvent).toHaveBeenCalledWith('a', 'disconnected')
  })

  it('falha num tenant não impede os outros', async () => {
    const deps = makeDeps(
      [
        { id: 'a', whatsappConnected: true },
        { id: 'b', whatsappConnected: true },
      ],
      { a: false, b: true },
    )
    deps.onEvent.mockImplementationOnce(async () => {
      throw new Error('boom')
    })
    await checkConnections(deps)
    expect(deps.onEvent).toHaveBeenCalledWith('b', 'connected')
  })
})
