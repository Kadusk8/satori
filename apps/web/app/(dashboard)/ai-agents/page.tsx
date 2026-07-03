import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth/session'

// Página só de gate: agentes de IA são geridos pelo super admin no painel
// /admin/tenants/[id]. Usuário de tenant é mandado pro kanban.
export default async function AIAgentsPage() {
  const claims = await getSessionClaims()
  if (!claims.userId) redirect('/login')
  if (!claims.isSuperAdmin) redirect('/conversations')
  redirect('/admin')
}
