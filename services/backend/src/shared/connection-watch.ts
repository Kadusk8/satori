// Reação aos eventos de conexão do WhatsApp (Evolution Go), sem polling: o Evolution avisa por
// webhook quando a instância cai, volta ou é deslogada, e este módulo decide o que fazer.
//
// - disconnected: o Evolution já tenta voltar sozinho. Esperamos uma janela (graceMs); se ao fim
//   dela ainda estiver fora, mandamos reconectar uma vez e, se continuar fora, avisamos.
// - connected: cancela a espera; se já tínhamos avisado que caiu, avisa que voltou.
// - logged_out: o aparelho foi removido no celular — só volta com QR novo, então avisa na hora.
//
// Sem dependências de banco/rede: tudo entra por `deps`, pra ser testável.

export type ConnectionEventKind = 'connected' | 'disconnected' | 'logged_out'
export type AlertKind = 'not_recovered' | 'logged_out' | 'recovered'

export interface WatchDeps {
  graceMs: number
  retryWaitMs: number
  /** true se a instância está conectada E logada agora. Pode lançar (ex: token inválido). */
  checkStatus(tenantId: string): Promise<boolean>
  reconnect(tenantId: string): Promise<void>
  setFlag(tenantId: string, connected: boolean): Promise<void>
  notify(tenantId: string, kind: AlertKind, detail?: string): Promise<void>
  schedule(fn: () => void, ms: number): unknown
  cancel(handle: unknown): void
  sleep(ms: number): Promise<void>
  log?(msg: string): void
}

interface TenantWatchState {
  timer: unknown | null
  alerted: boolean
}

export function createConnectionWatcher(deps: WatchDeps) {
  const states = new Map<string, TenantWatchState>()
  const log = deps.log ?? (() => {})

  function stateOf(tenantId: string): TenantWatchState {
    let s = states.get(tenantId)
    if (!s) {
      s = { timer: null, alerted: false }
      states.set(tenantId, s)
    }
    return s
  }

  async function safeNotify(tenantId: string, kind: AlertKind, detail?: string) {
    try {
      await deps.notify(tenantId, kind, detail)
    } catch (err) {
      log(`falha ao notificar (${kind}) tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function checkAndRecover(tenantId: string) {
    const s = stateOf(tenantId)
    s.timer = null
    try {
      if (await deps.checkStatus(tenantId)) {
        await deps.setFlag(tenantId, true) // voltou sozinha durante a janela
        return
      }
      log(`tenant ${tenantId} ainda fora após a janela — mandando reconectar`)
      await deps.reconnect(tenantId)
      await deps.sleep(deps.retryWaitMs)
      if (await deps.checkStatus(tenantId)) {
        await deps.setFlag(tenantId, true)
        return
      }
      s.alerted = true
      await safeNotify(tenantId, 'not_recovered')
    } catch (err) {
      // Ex: token inválido (401), servidor do Evolution fora do ar.
      s.alerted = true
      await safeNotify(tenantId, 'not_recovered', err instanceof Error ? err.message : String(err))
    }
  }

  return {
    async onEvent(tenantId: string, kind: ConnectionEventKind): Promise<void> {
      const s = stateOf(tenantId)

      if (kind === 'connected') {
        if (s.timer !== null) {
          deps.cancel(s.timer)
          s.timer = null
        }
        if (s.alerted) {
          s.alerted = false
          await safeNotify(tenantId, 'recovered')
        }
        return
      }

      if (kind === 'logged_out') {
        if (s.timer !== null) {
          deps.cancel(s.timer)
          s.timer = null
        }
        if (!s.alerted) {
          s.alerted = true
          await safeNotify(tenantId, 'logged_out')
        }
        return
      }

      // disconnected: oscila várias vezes por segundo durante a reconexão — uma espera só por tenant.
      if (s.timer !== null || s.alerted) return
      s.timer = deps.schedule(() => {
        void checkAndRecover(tenantId)
      }, deps.graceMs)
    },
    /** Só pra teste. */
    _state(tenantId: string): Readonly<TenantWatchState> {
      return stateOf(tenantId)
    },
  }
}
