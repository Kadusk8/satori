// Verificação periódica da conexão do WhatsApp de cada empresa ativa.
//
// O connection-watch só reage a eventos que o Evolution Go manda por webhook. Se o próprio
// Evolution cair (crash/restart), o evento de queda pode nunca chegar, ou chegar e a instância
// não voltar — foi assim que a JD Mens ficou 9 dias fora sem ninguém saber (2026-11). Aqui a
// gente pergunta o status de verdade e alimenta o mesmo watcher: ele já cuida da janela de
// espera, do pedido de reconexão e do aviso por e-mail, sem duplicar alerta.

import { pool } from '../db/index.js'
import { getEvolutionClient } from '../shared/evolution-client.js'
import { connectionWatcher } from '../core/webhook.js'
import type { ConnectionEventKind } from '../shared/connection-watch.js'

export interface CheckConnectionsDeps {
  listTenants(): Promise<Array<{ id: string; whatsappConnected: boolean }>>
  /** true se conectada E logada. Erro (Evolution fora, token inválido) conta como fora. */
  isConnected(tenantId: string): Promise<boolean>
  setFlag(tenantId: string, connected: boolean): Promise<void>
  onEvent(tenantId: string, kind: ConnectionEventKind): Promise<void>
  log?(msg: string): void
}

export async function checkConnections(deps: CheckConnectionsDeps): Promise<void> {
  const log = deps.log ?? (() => {})
  const tenants = await deps.listTenants()

  for (const t of tenants) {
    let connected: boolean
    try {
      connected = await deps.isConnected(t.id)
    } catch (err) {
      log(`tenant ${t.id}: falha ao checar status (${err instanceof Error ? err.message : String(err)})`)
      connected = false
    }

    try {
      if (connected !== t.whatsappConnected) await deps.setFlag(t.id, connected)
      await deps.onEvent(t.id, connected ? 'connected' : 'disconnected')
      if (!connected) log(`tenant ${t.id}: WhatsApp fora — entregue ao connection-watch`)
    } catch (err) {
      log(`tenant ${t.id}: erro ao tratar status (${err instanceof Error ? err.message : String(err)})`)
    }
  }
}

export function runCheckConnections(): Promise<void> {
  return checkConnections({
    async listTenants() {
      const res = await pool.query<{ id: string; whatsapp_connected: boolean }>(
        `select id, whatsapp_connected from tenants
          where status = 'active' and evolution_api_url is not null and evolution_api_key is not null`,
      )
      return res.rows.map((r) => ({ id: r.id, whatsappConnected: r.whatsapp_connected }))
    },
    async isConnected(tenantId) {
      const client = await getEvolutionClient(tenantId, process.env.ENCRYPTION_KEY)
      return (await client.checkConnection()).connected
    },
    async setFlag(tenantId, connected) {
      await pool.query(`update tenants set whatsapp_connected = $1 where id = $2`, [connected, tenantId])
    },
    onEvent: (tenantId, kind) => connectionWatcher.onEvent(tenantId, kind),
    log: (msg) => console.warn(`[check-connections] ${msg}`),
  })
}
