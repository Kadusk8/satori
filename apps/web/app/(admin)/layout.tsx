import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  if (!claims.isSuperAdmin) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  )
}
