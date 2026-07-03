import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus } from 'lucide-react'
import { TenantsFilter } from '@/components/admin/tenants-filter'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { tenants as tenantsTable } from '@/lib/db/schema'

const planVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  enterprise: 'default',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  onboarding: 'secondary',
  suspended: 'destructive',
  cancelled: 'destructive',
}

const statusLabel: Record<string, string> = {
  active: 'Ativo',
  onboarding: 'Onboarding',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
}

const segmentLabel: Record<string, string> = {
  clinica: 'Clínica',
  loja: 'Loja',
  restaurante: 'Restaurante',
  servicos: 'Serviços',
  outro: 'Outro',
}

interface TenantsPageProps {
  searchParams: Promise<{ status?: string; plan?: string; q?: string }>
}

export default async function TenantsPage({ searchParams }: TenantsPageProps) {
  const { status, plan, q } = await searchParams

  const tenants = await withAdmin((tx) => {
    const conds = []
    if (status) conds.push(eq(tenantsTable.status, status))
    if (plan) conds.push(eq(tenantsTable.plan, plan))
    if (q) {
      conds.push(
        or(
          ilike(tenantsTable.name, `%${q}%`),
          ilike(tenantsTable.ownerName, `%${q}%`),
          ilike(tenantsTable.ownerEmail, `%${q}%`)
        )!
      )
    }
    return tx
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        slug: tenantsTable.slug,
        businessSegment: tenantsTable.businessSegment,
        ownerName: tenantsTable.ownerName,
        ownerEmail: tenantsTable.ownerEmail,
        plan: tenantsTable.plan,
        status: tenantsTable.status,
        whatsappConnected: tenantsTable.whatsappConnected,
        messagesUsedMonth: tenantsTable.messagesUsedMonth,
        maxMessagesMonth: tenantsTable.maxMessagesMonth,
        createdAt: tenantsTable.createdAt,
      })
      .from(tenantsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(tenantsTable.createdAt))
  })

  const filtered = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    segment: t.businessSegment ?? '',
    ownerName: t.ownerName ?? '',
    ownerEmail: t.ownerEmail ?? '',
    plan: t.plan,
    status: t.status,
    whatsappConnected: t.whatsappConnected ?? false,
    messagesUsed: t.messagesUsedMonth ?? 0,
    maxMessages: t.maxMessagesMonth ?? 1000,
    createdAt: (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)).toISOString(),
  }))

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Empresas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} empresa{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" render={<Link href="/admin/tenants/new" />} nativeButton={false}
          className="gap-1.5 text-xs h-8">
          <Plus className="h-3.5 w-3.5" />
          Nova Empresa
        </Button>
      </div>

      {/* Filtros */}
      <TenantsFilter />

      {/* Tabela */}
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/60">
          <span className="text-sm font-semibold text-foreground">Lista de Empresas</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Nome / Responsável</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Segmento</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Plano</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">WhatsApp</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Mensagens</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Criado</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12 text-sm">
                  Nenhuma empresa encontrada com os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((tenant) => {
              const msgPct = Math.min((tenant.messagesUsed / tenant.maxMessages) * 100, 100)
              return (
                <TableRow key={tenant.id} className="border-border/40 hover:bg-accent/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{tenant.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground leading-none">{tenant.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{tenant.ownerName} · {tenant.ownerEmail}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {segmentLabel[tenant.segment] ?? tenant.segment}
                  </TableCell>
                  <TableCell>
                    <Badge variant={planVariant[tenant.plan]} className="text-[10px] px-1.5 py-0 h-4">{tenant.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[tenant.status]} className="text-[10px] px-1.5 py-0 h-4">{statusLabel[tenant.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${tenant.whatsappConnected ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {tenant.whatsappConnected ? '● Conectado' : '○ Desconectado'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{tenant.messagesUsed.toLocaleString('pt-BR')}</span>
                        <span>{tenant.maxMessages.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-20 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${msgPct >= 90 ? 'bg-red-500' : 'bg-primary'}`}
                          style={{ width: `${msgPct}%` }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" render={<Link href={`/admin/tenants/${tenant.id}`} />} nativeButton={false}
                      className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground">
                      Ver →
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
