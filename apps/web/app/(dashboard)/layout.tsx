import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'
import { NotificationPermissionBanner } from '@/components/pwa/notification-permission-banner'
import { withClaims } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  // Super admin "puro" não tem tenant — manda pro painel admin.
  if (claims.isSuperAdmin && !claims.tenantId) redirect('/admin')
  const businessModel = claims.tenantId
    ? await withClaims({ sub: claims.userId!, tenant_id: claims.tenantId, user_role: claims.userRole, is_super_admin: claims.isSuperAdmin }, async (tx) => {
        const [tenant] = await tx.select({ businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenantId!)).limit(1)
        return tenant?.businessModel === 'service' ? 'service' as const : 'product' as const
      })
    : 'product'

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <DashboardSidebar tenantId={claims.tenantId} userRole={claims.userRole} businessModel={businessModel} />
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <NotificationPermissionBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
