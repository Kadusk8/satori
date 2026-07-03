import { asc } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { tenants as tenantsTable } from '@/lib/db/schema'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, MessageSquare, Package, Users } from 'lucide-react'
import { PlanLimitsDialog } from './plan-limits-dialog'

const planVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  enterprise: 'default',
}

// Limites sugeridos por plano — informativo. O schema não tem uma tabela
// própria de planos; os limites reais são colunas por tenant (max_messages_month,
// max_products, max_operators), ajustáveis individualmente abaixo.
const PLAN_TIERS = [
  { id: 'free', label: 'Free', messages: 1000, products: 50, operators: 3 },
  { id: 'starter', label: 'Starter', messages: 5000, products: 200, operators: 5 },
  { id: 'pro', label: 'Pro', messages: 20000, products: 1000, operators: 15 },
  { id: 'enterprise', label: 'Enterprise', messages: 100000, products: 10000, operators: 50 },
] as const

export default async function PlansPage() {
  const all = await withAdmin((tx) =>
    tx
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        plan: tenantsTable.plan,
        status: tenantsTable.status,
        max_messages_month: tenantsTable.maxMessagesMonth,
        max_products: tenantsTable.maxProducts,
        max_operators: tenantsTable.maxOperators,
        messages_used_month: tenantsTable.messagesUsedMonth,
      })
      .from(tenantsTable)
      .orderBy(asc(tenantsTable.name))
  )
  const porPlano: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 }
  for (const t of all) {
    if (t.plan in porPlano) porPlano[t.plan]++
  }

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planos e Limites</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Referência de planos e ajuste de limites por empresa
        </p>
      </div>

      {/* Catálogo de planos (referência) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {PLAN_TIERS.map((tier) => (
          <Card key={tier.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  {tier.label}
                </span>
                <Badge variant={planVariant[tier.id]}>{porPlano[tier.id]} empresa{porPlano[tier.id] !== 1 ? 's' : ''}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Mensagens/mês</span>
                <span className="font-medium text-foreground">{tier.messages.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Produtos</span>
                <span className="font-medium text-foreground">{tier.products.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Operadores</span>
                <span className="font-medium text-foreground">{tier.operators}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empresas e seus limites atuais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Limites por empresa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {all.length === 0 && (
              <p className="text-sm text-muted-foreground p-6">Nenhuma empresa cadastrada.</p>
            )}
            {all.map((t) => {
              const pct = Math.min(((t.messages_used_month ?? 0) / (t.max_messages_month ?? 1000)) * 100, 100)
              return (
                <div key={t.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{t.name}</span>
                      <Badge variant={planVariant[t.plan]} className="text-[10px] px-1.5 py-0">{t.plan}</Badge>
                      {t.status === 'suspended' && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">suspensa</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {(t.messages_used_month ?? 0).toLocaleString('pt-BR')} / {(t.max_messages_month ?? 1000).toLocaleString('pt-BR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {t.max_products ?? 50} produtos
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t.max_operators ?? 3} operadores
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2 max-w-xs">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <PlanLimitsDialog tenant={t} />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
