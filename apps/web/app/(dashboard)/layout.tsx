import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'
import { NotificationPermissionBanner } from '@/components/pwa/notification-permission-banner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  // Super admin "puro" não tem tenant — manda pro painel admin.
  if (claims.isSuperAdmin && !claims.tenantId) redirect('/admin')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <DashboardSidebar tenantId={claims.tenantId} userRole={claims.userRole} />
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <NotificationPermissionBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
