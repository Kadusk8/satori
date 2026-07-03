import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionClaims } from '@/lib/supabase/get-claims'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const claims = await getSessionClaims(supabase)
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
