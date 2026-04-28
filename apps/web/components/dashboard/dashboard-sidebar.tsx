'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Users, Package,
  Calendar, Bot, Settings, LogOut, ChevronRight, MessagesSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [waitingCount,      setWaitingCount]      = useState(0)
  const [whatsappConnected, setWhatsappConnected] = useState(true)
  const [isLoggingOut,      setIsLoggingOut]      = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function loadCounts() {
      const { count } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting_human')
      setWaitingCount(count ?? 0)
    }
    loadCounts()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('sidebar-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const newRec = payload.new as Record<string, unknown>
        const oldRec = payload.old as Record<string, unknown>
        const newStatus = newRec?.status as string | undefined
        const oldStatus = oldRec?.status as string | undefined
        if (newStatus === 'waiting_human' && oldStatus !== 'waiting_human') {
          setWaitingCount(p => p + 1)
          toast.warning('Nova conversa aguardando atendimento', {
            description: 'Clique para abrir o kanban.',
            action: { label: 'Ver', onClick: () => router.push('/conversations') },
            duration: 8000,
          })
        }
        if (oldStatus === 'waiting_human' && newStatus !== 'waiting_human') {
          setWaitingCount(p => Math.max(0, p - 1))
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenants' }, (payload) => {
        if (typeof payload.new.whatsapp_connected === 'boolean') {
          setWhatsappConnected(payload.new.whatsapp_connected)
          if (!payload.new.whatsapp_connected) {
            toast.error('WhatsApp desconectado', {
              description: 'Acesse Configurações para reconectar.',
              duration: 10000,
            })
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      console.log('[Logout] Iniciando logout...')
      const supabase = createClient()
      console.log('[Logout] Supabase client criado')

      const { error } = await supabase.auth.signOut()
      console.log('[Logout] signOut retornou:', { error })

      if (error) {
        console.error('[Logout] Erro no signOut:', error)
        throw error
      }

      console.log('[Logout] Sucesso, redirecionando...')
      toast.success('Deslogado com sucesso')

      // Aguarda um pouco antes de redirecionar
      await new Promise(resolve => setTimeout(resolve, 500))
      window.location.href = '/login'
    } catch (err) {
      console.error('[Logout] Erro completo:', err)
      toast.error('Erro ao fazer logout: ' + (err instanceof Error ? err.message : String(err)))
      setIsLoggingOut(false)
    }
  }

  const navItems = [
    { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard, badge: 0 },
    { label: 'CRM',          href: '/conversations', icon: MessageSquare,   badge: waitingCount },
    { label: 'Contatos',     href: '/contacts',      icon: Users,           badge: 0 },
    { label: 'Produtos',     href: '/products',      icon: Package,         badge: 0 },
    { label: 'Agenda',       href: '/appointments',  icon: Calendar,        badge: 0 },
    { label: 'Configurações',href: '/settings',      icon: Settings,        badge: 0 },
  ]

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border/60 bg-[oklch(0.12_0.015_240)]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border/60">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary shrink-0">
          <span className="text-primary-foreground font-black text-[11px] tracking-wider">S</span>
        </div>
        <div className="leading-none">
          <span className="text-sm font-black tracking-widest text-foreground">SATORI</span>
          <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Painel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
            (item.href === '/conversations' && pathname.startsWith('/chat/'))
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
              {item.badge > 0 && <NotificationBadge count={item.badge} />}
              {isActive && item.badge === 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* WhatsApp status */}
      <div className="px-3 pb-2">
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] transition-colors',
          whatsappConnected
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-red-500/20 bg-red-500/5'
        )}>
          <MessagesSquare className={cn('h-3.5 w-3.5 shrink-0', whatsappConnected ? 'text-emerald-400' : 'text-red-400')} />
          <span className="text-muted-foreground flex-1">
            WhatsApp {whatsappConnected ? 'conectado' : 'desconectado'}
          </span>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            whatsappConnected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'
          )} />
        </div>
      </div>

      {/* Divisor */}
      <div className="mx-3 border-t border-border/60" />

      {/* Footer */}
      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-accent transition-colors">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="text-[9px] font-bold bg-primary text-primary-foreground">OP</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate leading-none text-foreground">Operador</p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">operador@empresa.com</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sair">
            <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </aside>
  )
}
