'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function AIAgentsPage() {
  const router = useRouter()

  useEffect(() => {
    const checkAccess = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Usuário não autenticado')
        router.push('/login')
        return
      }

      // Verificar se é super admin
      const { data: superAdmin } = await supabase
        .from('super_admins')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!superAdmin) {
        // Não é super admin, redirecionar para conversas
        toast.error('Acesso negado')
        router.push('/conversations')
        return
      }
    }

    checkAccess()
  }, [router])

  return (
    <div className="p-8 flex items-center justify-center h-screen text-muted-foreground">
      Carregando...
    </div>
  )
}
