import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  if (!claims.isSuperAdmin) redirect('/login')

  return (
    // Mesmo esqueleto do layout do dashboard: no celular a sidebar vira menu
    // lateral (cabeçalho em cima, conteúdo embaixo); a partir de md fica fixa.
    // h-dvh + px-safe: altura e laterais corretas no iPhone com o app instalado.
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden bg-background px-safe">
      <AdminSidebar />
      <main className="flex-1 min-h-0 overflow-y-auto bg-background pb-safe">
        {children}
      </main>
    </div>
  )
}
