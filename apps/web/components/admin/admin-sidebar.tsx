'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Settings,
  CreditCard,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const navItems = [
  { label: 'Dashboard',     href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Empresas',      href: '/admin/tenants',   icon: Building2 },
  { label: 'Analytics',     href: '/admin/analytics', icon: BarChart3 },
  { label: 'Planos',        href: '/admin/plans',     icon: CreditCard },
  { label: 'Configurações', href: '/admin/settings',  icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      console.log('[Admin Logout] Iniciando logout...')
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      console.log('[Admin Logout] signOut retornou:', { error })
      if (error) throw error
      console.log('[Admin Logout] Sucesso, redirecionando...')
      toast.success('Deslogado com sucesso')
      await new Promise(resolve => setTimeout(resolve, 500))
      window.location.href = '/login'
    } catch (err) {
      console.error('[Admin Logout] Erro:', err)
      toast.error('Erro ao fazer logout: ' + (err instanceof Error ? err.message : String(err)))
      setIsLoggingOut(false)
    }
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border/60 bg-[oklch(0.12_0.015_240)]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border/60">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary shrink-0">
          <span className="text-primary-foreground font-black text-[11px] tracking-wider">S</span>
        </div>
        <div className="leading-none">
          <span className="text-sm font-black tracking-widest text-foreground">SATORI</span>
          <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground glow-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Divisor */}
      <div className="mx-3 border-t border-border/60" />

      {/* Footer */}
      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-accent transition-colors">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="text-[9px] font-bold bg-primary text-primary-foreground">
              SA
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate leading-none text-foreground">Super Admin</p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">satori.admin</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sair"
          >
            <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </aside>
  )
}
