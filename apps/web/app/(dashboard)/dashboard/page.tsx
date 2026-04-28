import Link from 'next/link'
import {
  MessageSquare, Users, Bot, Clock,
  ArrowUpRight, CheckCircle2, AlertCircle, TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const stats = [
  { title: 'Conversas hoje',   value: '24',    change: '+12%', icon: MessageSquare, colorClass: 'text-blue-400',   bgClass: 'bg-blue-400/10 border-blue-400/20' },
  { title: 'Novos leads',      value: '9',     change: '+5%',  icon: Users,         colorClass: 'text-emerald-400',bgClass: 'bg-emerald-400/10 border-emerald-400/20' },
  { title: 'Atendidas pela IA',value: '18',    change: '75%',  icon: Bot,           colorClass: 'text-indigo-400', bgClass: 'bg-indigo-400/10 border-indigo-400/20' },
  { title: 'Tempo médio',      value: '4m 32s',change: '-8%',  icon: Clock,         colorClass: 'text-amber-400',  bgClass: 'bg-amber-400/10 border-amber-400/20' },
]

const recentConversations = [
  { id: '1', name: 'João Silva',     phone: '+55 62 9 9999-0001', lastMessage: 'Qual o preço do produto X?',        status: 'ai_handling',    time: '2 min' },
  { id: '2', name: 'Maria Santos',   phone: '+55 62 9 9999-0002', lastMessage: 'Quero agendar uma consulta',        status: 'waiting_human',  time: '5 min' },
  { id: '3', name: 'Carlos Oliveira',phone: '+55 62 9 9999-0003', lastMessage: 'Obrigado pelo atendimento!',        status: 'human_handling', time: '12 min' },
  { id: '4', name: 'Ana Costa',      phone: '+55 62 9 9999-0004', lastMessage: 'Tem disponibilidade amanhã?',       status: 'ai_handling',    time: '18 min' },
  { id: '5', name: 'Pedro Ferreira', phone: '+55 62 9 9999-0005', lastMessage: 'Preciso de mais informações',       status: 'closed',         time: '1h' },
]

const statusConfig: Record<string, { label: string; dot: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ai_handling:   { label: 'IA atendendo', dot: 'bg-blue-400',    variant: 'default' },
  waiting_human: { label: 'Aguardando',   dot: 'bg-amber-400 animate-pulse', variant: 'destructive' },
  human_handling:{ label: 'Em atendimento',dot: 'bg-emerald-400',variant: 'secondary' },
  closed:        { label: 'Encerrado',    dot: 'bg-muted-foreground', variant: 'outline' },
}

const usageItems = [
  { label: 'Mensagens este mês', used: 342, max: 1000 },
  { label: 'Produtos cadastrados', used: 18, max: 50 },
  { label: 'Operadores', used: 2, max: 3 },
]

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.title} className="rounded-lg border border-border/60 bg-card p-4">
            <div className={`inline-flex items-center justify-center rounded-md p-2 border mb-3 ${stat.bgClass}`}>
              <stat.icon className={`h-4 w-4 ${stat.colorClass}`} />
            </div>
            <p className="text-2xl font-black tabular-nums text-foreground leading-none">{stat.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{stat.title}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-medium">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Conversas recentes */}
        <div className="xl:col-span-2 rounded-lg border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
            <span className="text-sm font-semibold text-foreground">Conversas Recentes</span>
            <Link href="/conversations"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              Ver kanban <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/40">
            {recentConversations.map((conv) => {
              const s = statusConfig[conv.status]
              return (
                <Link key={conv.id} href={`/chat/${conv.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{conv.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground leading-none">{conv.name}</span>
                      <span className="text-[10px] text-muted-foreground">{conv.phone}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      <span className="text-[10px] text-muted-foreground font-medium">{s.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60">{conv.time} atrás</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Status do sistema */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <span className="text-sm font-semibold text-foreground block mb-3">Status do Sistema</span>
            <div className="space-y-2.5">
              {[
                { label: 'WhatsApp', ok: true },
                { label: 'Agente IA', ok: true },
                { label: 'Webhook Evolution', ok: true },
                { label: 'Banco de dados', ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  {item.ok
                    ? <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" />Online
                      </span>
                    : <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                        <AlertCircle className="h-3 w-3" />Erro
                      </span>
                  }
                </div>
              ))}
            </div>
          </div>

          {/* Uso do plano */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <span className="text-sm font-semibold text-foreground block mb-3">Uso do Plano</span>
            <div className="space-y-4">
              {usageItems.map(({ label, used, max }) => {
                const pct = Math.min((used / max) * 100, 100)
                const danger = pct >= 90
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-semibold tabular-nums ${danger ? 'text-red-400' : 'text-foreground'}`}>
                        {used} / {max}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${danger ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
