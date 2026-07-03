import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  // Super admin "puro" não tem tenant — manda pro painel admin.
  if (claims.isSuperAdmin && !claims.tenantId) redirect('/admin')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar tenantId={claims.tenantId} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  )
}
