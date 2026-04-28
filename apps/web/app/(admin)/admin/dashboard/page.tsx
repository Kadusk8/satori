import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Building2, MessageSquare, Wifi, Activity,
  ArrowUpRight, Plus, WifiOff, TrendingUp,
} from 'lucide-react'

const planVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary', starter: 'outline', pro: 'default', enterprise: 'default',
}
const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default', onboarding: 'secondary', suspended: 'destructive', cancelled: 'destructive',
}
const statusLabel: Record<string, string> = {
  active: 'Ativo', onboarding: 'Onboarding', suspended: 'Suspenso', cancelled: 'Cancelado',
}
const segmentLabel: Record<string, string> = {
  clinica: 'Clínica', loja: 'Loja', restaurante: 'Restaurante', servicos: 'Serviços', outro: 'Outro',
}

export default async function AdminDashboardPage() {
  const supabase = createServiceClient()
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, business_segment, plan, status, whatsapp_connected, messages_used_month, max_messages_month, created_at')
    .order('created_at', { ascending: false })

  const all = tenants ?? []
  const totalEmpresas  = all.length
  const ativas         = all.filter(t => t.status === 'active').length
  const onboarding     = all.filter(t => t.status === 'onboarding').length
  const conectadas     = all.filter(t => t.whatsapp_connected).length
  const totalMensagens = all.reduce((s, t) => s + (t.messages_used_month ?? 0), 0)
  const recentes       = all.slice(0, 7)

  const porPlano: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 }
  for (const t of all) { if (t.plan in porPlano) porPlano[t.plan]++ }

  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Visão geral · SATORI Admin</p>
        </div>
        <Button size="sm" render={<Link href="/admin/tenants/new" />} nativeButton={false}
          className="gap-1.5 text-xs h-8">
          <Plus className="h-3.5 w-3.5" />
          Nova Empresa
        </Button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Total de Empresas"
          value={totalEmpresas}
          sub={`${onboarding} em onboarding`}
          icon={<Building2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Empresas Ativas"
          value={ativas}
          sub={`${Math.round((ativas / Math.max(totalEmpresas, 1)) * 100)}% do total`}
          icon={<Activity className="h-4 w-4" />}
          accent
        />
        <KpiCard
          label="Mensagens / Mês"
          value={totalMensagens.toLocaleString('pt-BR')}
          sub="soma de todas as empresas"
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <KpiCard
          label="WhatsApp Ativo"
          value={`${conectadas}/${totalEmpresas}`}
          sub={`${Math.round((conectadas / Math.max(totalEmpresas, 1)) * 100)}% conectadas`}
          icon={<Wifi className="h-4 w-4" />}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Empresas recentes */}
        <div className="lg:col-span-2 rounded-lg border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
            <span className="text-sm font-semibold text-foreground">Empresas Recentes</span>
            <Link href="/admin/tenants"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              Ver todas <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Nenhuma empresa cadastrada.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentes.map((t) => (
                <Link key={t.id} href={`/admin/tenants/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors group">
                  <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-none">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {segmentLabel[t.business_segment ?? ''] ?? t.business_segment ?? '—'} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.whatsapp_connected
                      ? <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium"><Wifi className="h-3 w-3" />On</span>
                      : <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><WifiOff className="h-3 w-3" />Off</span>
                    }
                    <Badge variant={planVariant[t.plan]} className="text-[10px] px-1.5 py-0 h-4">{t.plan}</Badge>
                    <Badge variant={statusVariant[t.status]} className="text-[10px] px-1.5 py-0 h-4">{statusLabel[t.status]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Por plano */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Por Plano</span>
            </div>
            <div className="space-y-3">
              {Object.entries(porPlano).map(([plan, count]) => (
                <div key={plan}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize text-foreground font-medium">{plan}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${totalEmpresas > 0 ? (count / totalEmpresas) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <span className="text-sm font-semibold text-foreground block mb-3">Status</span>
            <div className="space-y-2">
              {[
                { label: 'Ativas',       value: ativas,                                          color: 'text-emerald-400' },
                { label: 'Onboarding',   value: onboarding,                                      color: 'text-amber-400' },
                { label: 'Suspensas',    value: all.filter(t => t.status === 'suspended').length, color: 'text-red-400' },
                { label: 'Canceladas',   value: all.filter(t => t.status === 'cancelled').length, color: 'text-muted-foreground' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-0.5">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className={`text-sm font-bold tabular-nums ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub: string
  icon: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent
      ? 'border-primary/30 bg-primary/5'
      : 'border-border/60 bg-card'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${accent ? 'text-primary' : 'text-muted-foreground'}`}>
          {label}
        </span>
        <span className={accent ? 'text-primary' : 'text-muted-foreground'}>
          {icon}
        </span>
      </div>
      <p className={`text-2xl font-black tabular-nums leading-none ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
    </div>
  )
}
