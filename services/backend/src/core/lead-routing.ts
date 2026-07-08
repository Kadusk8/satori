// Distribuição round-robin de leads escalados pela IA entre vendedores
// (users.role = 'operator') online. Chamado por toolEscalateToHuman.

import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'

export interface EligibleVendor {
  id: string
  fullName: string
}

/**
 * Escolhe o próximo vendedor elegível (online e ativo) em rotação, a partir
 * do ponteiro `tenants.last_lead_assigned_to`. Usa `FOR UPDATE` na linha do
 * tenant pra serializar escalonamentos concorrentes do mesmo tenant — evita
 * mandar dois leads seguidos pro mesmo vendedor.
 */
export async function assignNextVendedor(tenantId: string): Promise<EligibleVendor | null> {
  return db.transaction(async (tx) => {
    const tenantRes = await tx.execute(sql`
      select last_lead_assigned_to from tenants where id = ${tenantId} for update
    `)
    const lastAssignedTo = (tenantRes.rows[0] as { last_lead_assigned_to: string | null } | undefined)?.last_lead_assigned_to ?? null

    const eligibleRes = await tx.execute(sql`
      select id, full_name from users
      where tenant_id = ${tenantId} and role = 'operator' and is_available = true and active = true
      order by created_at asc
    `)
    const eligible = eligibleRes.rows as Array<{ id: string; full_name: string }>
    if (eligible.length === 0) return null

    const lastIdx = lastAssignedTo ? eligible.findIndex((r) => r.id === lastAssignedTo) : -1
    const chosen = eligible[(lastIdx + 1) % eligible.length]

    await tx.execute(sql`update tenants set last_lead_assigned_to = ${chosen.id} where id = ${tenantId}`)

    return { id: chosen.id, fullName: chosen.full_name }
  })
}

/** Total de vendedores cadastrados e ativos no tenant (online ou não) — usado pro fallback de time pequeno. */
export async function countRegisteredVendors(tenantId: string): Promise<number> {
  const res = await db.execute(sql`
    select count(*)::int as n from users where tenant_id = ${tenantId} and role = 'operator' and active = true
  `)
  return (res.rows[0] as { n: number } | undefined)?.n ?? 0
}
