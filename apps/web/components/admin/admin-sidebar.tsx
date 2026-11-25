'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { logout } from '@/app/(auth)/actions'
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Settings,
  CreditCard,
  Bot,
  PlayCircle,
  LogOut,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SatoriMark, SatoriWordmark } from '@/components/brand/satori-logo'

const navItems = [
  { label: 'Dashboard',     href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Empresas',      href: '/admin/tenants',   icon: Building2 },
  { label: 'Analytics',     href: '/admin/analytics', icon: BarChart3 },
  { label: 'Planos',        href: '/admin/plans',     icon: CreditCard },
  { label: 'Treinamento IA', href: '/admin/training',  icon: Bot },
  { label: 'Tutoriais',     href: '/admin/tutoriais', icon: PlayCircle },
  { label: 'Configurações', href: '/admin/settings',  icon: Settings },
]

function AdminBrand() {
  return (
    <div className="flex items-center gap-3">
      <SatoriMark className="h-8 w-8 shrink-0" />
      <div className="leading-none">
        <SatoriWordmark className="h-3.5 w-auto text-foreground" />
        <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Admin</p>
      </div>
    </div>
  )
}

function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await logout()
    } catch (err) {
      // logout() faz redirect('/login') — o NEXT_REDIRECT não é erro real.
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) return
      toast.error('Erro ao fazer logout: ' + (err instanceof Error ? err.message : String(err)))
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center px-4 border-b border-border/60">
        <AdminBrand />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                // py-2.5 no celular: alvo de toque maior; volta ao compacto no desktop.
                'group flex items-center gap-2.5 rounded-md px-3 py-2.5 md:py-2 text-sm font-medium transition-all duration-150',
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
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminSidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <>
      {/* Desktop/tablet: sidebar fixa. pt-safe/pb-safe pro iPad com o app instalado. */}
      <aside className="hidden md:flex h-full w-56 shrink-0 flex-col border-r border-border/60 bg-[oklch(0.12_0.015_240)] pt-safe pb-safe">
        <SidebarContent />
      </aside>

      {/* Celular: cabeçalho com botão de menu. box-content: 56px úteis + o recuo do notch por fora. */}
      <div className="md:hidden flex box-content h-14 pt-safe shrink-0 items-center gap-3 px-4 border-b border-border/60 bg-[oklch(0.12_0.015_240)]">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger className="-ml-1 p-1 text-muted-foreground hover:text-foreground" aria-label="Abrir menu">
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 pt-safe pb-safe bg-[oklch(0.12_0.015_240)] border-border/60">
            <SheetTitle className="sr-only">Menu do admin</SheetTitle>
            <SidebarContent onItemClick={() => setIsMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <AdminBrand />
      </div>
    </>
  )
}
