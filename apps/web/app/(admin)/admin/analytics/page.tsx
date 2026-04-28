import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  Building2,
  MessageSquare,
  Wifi,
  TrendingUp,
  Bot,
} from 'lucide-react'

const planVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  enterprise: 'default',
}

const segmentLabel: Record<string, string> = {
  clinica: 'Clínica / Saúde',
  loja: 'Loja',
  restaurante: 'Restaurante',
  servicos: 'Serviços',
  outro: 'Outro',
}

export default async function AnalyticsPage() {
  const supabase = createServiceClient()

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, business_segment, plan, status, whatsapp_connected, messages_used_month, max_messages_month, created_at')
    .order('messages_used_month', { ascending: false })

  const all = tenants ?? []

  const totalMensagens = all.reduce((s, t) => s + (t.messages_used_month ?? 0), 0)
  const totalMax = all.reduce((s, t) => s + (t.max_messages_month ?? 0), 0)
  const conectadas = all.filter(t => t.whatsapp_connected).length
  const ativas = all.filter(t => t.status === 'active').length

  // Top 5 por uso de mensagens
  const topUso = all.slice(0, 5)

  // Distribuição por segmento
  const porSegmento: Record<string, number> = {}
  for (const t of all) {
    const seg = t.business_segment ?? 'outro'
    porSegmento[seg] = (porSegmento[seg] ?? 0) + 1
  }

  // Distribuição por plano
  const porPlano: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 }
  for (const t of all) {
    if (t.plan in porPlano) porPlano[t.plan]++
  }

  // Empresas adicionadas por mês (últimos 6 meses)
  const agora = new Date()
  const meses: { label: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const proximoMes = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    const count = all.filter(t => {
      const c = new Date(t.created_at)
      return c >= d && c < proximoMes
    }).length
    meses.push({ label, count })
  }
  const maxMes = Math.max(...meses.map(m => m.count), 1)

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Métricas consolidadas de todas as empresas na plataforma
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          label="Total de Empresas"
          value={all.length}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          label="Mensagens Este Mês"
          value={totalMensagens.toLocaleString('pt-BR')}
          sub={`limite total: ${totalMax.toLocaleString('pt-BR')}`}
        />
        <StatCard
          icon={<Wifi className="h-4 w-4 text-muted-foreground" />}
          label="WhatsApp Ativo"
          value={`${conectadas} / ${all.length}`}
          sub={`${Math.round((conectadas / Math.max(all.length, 1)) * 100)}% conectadas`}
        />
        <StatCard
          icon={<Bot className="h-4 w-4 text-muted-foreground" />}
          label="Empresas Ativas"
          value={`${ativas} / ${all.length}`}
          sub={`${Math.round((ativas / Math.max(all.length, 1)) * 100)}% da base`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top empresas por uso */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Top Empresas por Uso de Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {topUso.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma empresa com mensagens registradas.</p>
            ) : topUso.map((t) => {
              const pct = Math.min(((t.messages_used_month ?? 0) / (t.max_messages_month ?? 1000)) * 100, 100)
              return (
                <div key={t.id}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate max-w-[180px]">{t.name}</span>
                      <Badge variant={planVariant[t.plan]} className="text-[10px] px-1.5 py-0">{t.plan}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(t.messages_used_month ?? 0).toLocaleString('pt-BR')} / {(t.max_messages_month ?? 1000).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Crescimento por mês */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Novas Empresas (últimos 6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {meses.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {m.count > 0 ? m.count : ''}
                  </span>
                  <div className="w-full rounded-t-sm bg-primary/20 relative" style={{ height: '100px' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-primary transition-all"
                      style={{ height: `${(m.count / maxMes) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{m.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por segmento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Empresas por Segmento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(porSegmento).sort((a, b) => b[1] - a[1]).map(([seg, count]) => (
              <div key={seg}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{segmentLabel[seg] ?? seg}</span>
                  <span className="text-muted-foreground">{count} empresa{count !== 1 ? 's' : ''}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${(count / all.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(porSegmento).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            )}
          </CardContent>
        </Card>

        {/* Distribuição por plano */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Empresas por Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(porPlano).map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-3">
                <Badge variant={planVariant[plan]} className="w-20 justify-center">{plan}</Badge>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${all.length > 0 ? (count / all.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
