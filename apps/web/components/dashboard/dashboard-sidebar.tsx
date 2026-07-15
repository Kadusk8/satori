'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Users, Package,
  Calendar, Settings, LogOut, ChevronRight, MessagesSquare, UserCog, Menu
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { logout } from '@/app/(auth)/actions'
import { getWaitingCount } from '@/lib/data/conversations'
import { getPusherClient, tenantChannel } from '@/lib/realtime/client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { InstallPrompt } from '@/components/pwa/install-prompt'

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

interface DashboardSidebarProps {
  tenantId: string | null
  userRole: string | null
}

const roleLabel: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Vendedor',
}

export function DashboardSidebar({ tenantId, userRole }: DashboardSidebarProps) {
  const pathname = usePathname()
  const isManagerRole = userRole === 'owner' || userRole === 'admin'

  const [waitingCount, setWaitingCount] = useState(0)
  // TODO(Fase 5): status de conexão do WhatsApp virá do serviço backend
  // (Portainer) via evento Pusher — ainda não há produtor desse evento.
  const [whatsappConnected] = useState(true)
  const [isLoggingOut,      setIsLoggingOut]      = useState(false)

  useEffect(() => {
    if (!tenantId) return

    getWaitingCount().then(setWaitingCount).catch(() => {})

    const pusherClient = getPusherClient()
    if (!pusherClient) return

    const channel = pusherClient.subscribe(tenantChannel(tenantId))
    const handler = () => { getWaitingCount().then(setWaitingCount).catch(() => {}) }
    channel.bind('conversation:changed', handler)

    return () => {
      channel.unbind('conversation:changed', handler)
      pusherClient.unsubscribe(tenantChannel(tenantId))
    }
  }, [tenantId])

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await logout()
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) return
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
    ...(isManagerRole ? [{ label: 'Equipe', href: '/team', icon: UserCog, badge: 0 }] : []),
    { label: 'Configurações',href: '/settings', icon: Settings, badge: 0 },
  ]

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border/60 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary shrink-0">
          <span className="text-primary-foreground font-black text-[11px] tracking-wider">S</span>
        </div>
        <div className="leading-none">
          <span className="text-sm font-black tracking-widest text-foreground">SATORI</span>
          <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Painel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
            (item.href === '/conversations' && pathname.startsWith('/chat/'))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
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

      <div className="shrink-0 mt-auto">
        {/* PWA Install */}
        <div className="px-3 pb-2">
          <InstallPrompt />
        </div>

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
              <AvatarFallback className="text-[9px] font-bold bg-primary text-primary-foreground">
                {(userRole ? roleLabel[userRole] ?? userRole : '??').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate leading-none text-foreground">
                {userRole ? roleLabel[userRole] ?? userRole : 'Usuário'}
              </p>
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
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex h-screen w-56 flex-col border-r border-border/60 bg-[oklch(0.12_0.015_240)] shrink-0">
        <SidebarContent />
      </aside>

      <div className="md:hidden flex h-14 items-center gap-3 px-4 border-b border-border/60 bg-[oklch(0.12_0.015_240)] shrink-0">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger className="text-muted-foreground hover:text-foreground">
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-[oklch(0.12_0.015_240)] border-border/60">
            <SidebarContent onItemClick={() => setIsMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary shrink-0 ml-2">
          <span className="text-primary-foreground font-black text-[11px] tracking-wider">S</span>
        </div>
        <div className="leading-none">
          <span className="text-sm font-black tracking-widest text-foreground">SATORI</span>
        </div>
      </div>
    </>
  )
}
