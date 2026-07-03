'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { aiAgents } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

export interface AgentInput {
  id?: string
  tenantId: string
  name: string
  slug: string
  model: string
  type: 'sdr' | 'support' | 'scheduler' | 'custom'
  is_active: boolean
  is_default: boolean
}

async function requireSuperAdmin() {
  const claims = await getDbClaims()
  if (!claims?.is_super_admin) throw new Error('Apenas o super admin gerencia agentes.')
}

/** Cria ou atualiza um agente de IA (só super admin). Retorna a linha salva. */
export async function saveAgent(input: AgentInput) {
  await requireSuperAdmin()
  const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-')

  const row = await withAdmin(async (tx) => {
    if (input.id) {
      const res = await tx
        .update(aiAgents)
        .set({
          name: input.name,
          slug,
          model: input.model,
          type: input.type,
          isActive: input.is_active,
          isDefault: input.is_default,
          updatedAt: new Date(),
        })
        .where(eq(aiAgents.id, input.id))
        .returning()
      return res[0]
    }
    const res = await tx
      .insert(aiAgents)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        slug,
        model: input.model,
        type: input.type,
        isActive: input.is_active,
        isDefault: input.is_default,
        systemPrompt: `Você é um assistente de IA especializado em ${
          input.type === 'sdr' ? 'vendas' : input.type === 'support' ? 'suporte' : 'agendamento'
        }. Seja prestativo e profissional.`,
        escalationRules: {},
        sdrInstructions: {},
      })
      .returning()
    return res[0]
  })

  revalidatePath(`/admin/tenants/${input.tenantId}`)
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    model: row.model,
    type: row.type as AgentInput['type'],
    is_active: row.isActive,
    is_default: row.isDefault,
  }
}

/** Lista os agentes de um tenant (só super admin). */
export async function listAgents(tenantId: string) {
  await requireSuperAdmin()
  return withAdmin((tx) =>
    tx.select().from(aiAgents).where(and(eq(aiAgents.tenantId, tenantId)))
  )
}
