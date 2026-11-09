import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDbClaims } from '@/lib/auth/session'
import { withClaims } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { TrainingChat } from '@/components/ai-training/training-chat'

export const dynamic = 'force-dynamic'

// "Teste com a IA": só o proprietário (owner/admin) conversa com a IA como se fosse um cliente.
export default async function AITrainingPage() {
  const claims = await getDbClaims()
  if (!claims?.sub) redirect('/login')
  if (claims.is_super_admin === true) redirect('/admin')
  if (!claims.tenant_id || (claims.user_role !== 'owner' && claims.user_role !== 'admin')) redirect('/dashboard')

  const [tenant] = await withClaims(claims, (tx) =>
    tx.select({ name: tenants.name, businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenant_id!)).limit(1)
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Testar a IA</h1>
        <p className="text-sm text-muted-foreground">Converse como um cliente e diga o que quer que a IA responda diferente.</p>
      </div>
      <TrainingChat
        businessName={(tenant?.name ?? 'Sua empresa').trim()}
        businessModel={tenant?.businessModel === 'service' || tenant?.businessModel === 'fashion' ? tenant.businessModel : 'product'}
      />
    </div>
  )
}
