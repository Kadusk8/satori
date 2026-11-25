import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionClaims } from '@/lib/auth/session'
import { safeCallbackPath } from '@/lib/auth/safe-redirect'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'
import { NotificationPermissionBanner } from '@/components/pwa/notification-permission-banner'
import { SessionRefresh } from '@/components/pwa/session-refresh'
import { withClaims } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) {
    // Mantém o destino (ex: /chat/{id} aberto pelo push) pra voltar pra ele depois do login.
    const callbackPath = safeCallbackPath((await headers()).get('x-pathname'))
    redirect(callbackPath ? `/login?callbackUrl=${encodeURIComponent(callbackPath)}` : '/login')
  }
  // Super admin "puro" não tem tenant — manda pro painel admin.
  if (claims.isSuperAdmin && !claims.tenantId) redirect('/admin')
  const businessModel = claims.tenantId
    ? await withClaims({ sub: claims.userId!, tenant_id: claims.tenantId, user_role: claims.userRole, is_super_admin: claims.isSuperAdmin }, async (tx) => {
        const [tenant] = await tx.select({ businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenantId!)).limit(1)
        return tenant?.businessModel === 'service' || tenant?.businessModel === 'fashion' ? tenant.businessModel : 'product' as const
      })
    : 'product'

  return (
    // h-dvh: no iPhone, 100vh ignora a barra do Safari e o teclado — o campo do chat sumia.
    // px-safe: no iPhone deitado, o notch fica nas laterais.
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden bg-background px-safe">
      <DashboardSidebar tenantId={claims.tenantId} userRole={claims.userRole} businessModel={businessModel} />
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
        <NotificationPermissionBanner />
        <SessionRefresh />
        {/* min-h-0: sem isso o flex item não encolhe e as páginas com h-full
            (chat, CRM, agenda) estouram a altura da tela. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
