'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { computeScore, tierFor, type ScoreRules } from '@/lib/client-score'
import { saveClientScoreRules } from '@/lib/actions/client-score-rules'
import { formatBRL } from '@/lib/utils'

function toInt(value: string) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function ScoreRulesManager({
  initialRules,
  products,
}: {
  initialRules: ScoreRules
  products: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [rules, setRules] = useState<ScoreRules>(initialRules)
  const [saving, setSaving] = useState(false)
  const [example, setExample] = useState({ visits: 5, totalSpent: 1000, noShows: 1 })

  const set = <K extends keyof ScoreRules>(key: K, value: ScoreRules[K]) =>
    setRules((prev) => ({ ...prev, [key]: value }))

  const exampleScore = useMemo(
    () => computeScore({ ...example, servicesCount: {} }, rules),
    [example, rules]
  )
  const exampleTier = tierFor(exampleScore, rules.tiers)

  const usedBonusIds = new Set(rules.serviceBonuses.map((b) => b.productId))
  const nextBonusProduct = products.find((p) => !usedBonusIds.has(p.id))

  async function handleSave() {
    setSaving(true)
    try {
      await saveClientScoreRules(rules)
      toast.success('Regras de pontuação salvas')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Como o cliente ganha pontos</CardTitle>
          <CardDescription>Só atendimentos concluídos contam. Faltas descontam pontos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Pontos por visita">
            <Input
              type="number"
              min={0}
              className="w-28"
              value={rules.pointsPerVisit}
              onChange={(e) => set('pointsPerVisit', toInt(e.target.value))}
            />
          </Row>
          <Row label="Pontos por valor gasto">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                type="number"
                min={0}
                className="w-24"
                value={rules.pointsPerSpendStep}
                onChange={(e) => set('pointsPerSpendStep', toInt(e.target.value))}
              />
              <span className="text-muted-foreground">ponto(s) a cada R$</span>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                className="w-28"
                value={rules.spendStep}
                onChange={(e) => set('spendStep', Number(e.target.value))}
              />
              <span className="text-muted-foreground">gastos</span>
            </div>
          </Row>
          <Row label="Penalidade por falta">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">−</span>
              <Input
                type="number"
                min={0}
                className="w-28"
                value={rules.noShowPenalty}
                onChange={(e) => set('noShowPenalty', toInt(e.target.value))}
              />
              <span className="text-muted-foreground">pontos</span>
            </div>
          </Row>
          <Row label="Período considerado">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={rules.windowMonths === null ? 'all' : 'window'}
                onChange={(e) => set('windowMonths', e.target.value === 'all' ? null : 12)}
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="all">Todo o histórico</option>
                <option value="window">Últimos meses</option>
              </select>
              {rules.windowMonths !== null && (
                <>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={rules.windowMonths}
                    onChange={(e) => set('windowMonths', Math.max(1, toInt(e.target.value)))}
                  />
                  <span className="text-muted-foreground">meses</span>
                </>
              )}
            </div>
          </Row>
          <Row label="Cliente fica inativo após">
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="number"
                min={1}
                className="w-24"
                value={rules.inactiveAfterDays}
                onChange={(e) => set('inactiveAfterDays', Math.max(1, toInt(e.target.value)))}
              />
              <span className="text-muted-foreground">dias sem visita</span>
            </div>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bônus por serviço</CardTitle>
          <CardDescription>Pontos extras cada vez que o cliente faz um serviço específico.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.serviceBonuses.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum bônus configurado.</p>
          )}
          {rules.serviceBonuses.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={b.productId}
                onChange={(e) =>
                  set(
                    'serviceBonuses',
                    rules.serviceBonuses.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x))
                  )
                }
                className="h-9 flex-1 min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {products
                  .filter((p) => p.id === b.productId || !usedBonusIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
              <span className="text-sm text-muted-foreground">+</span>
              <Input
                type="number"
                className="w-24"
                value={b.points}
                onChange={(e) =>
                  set(
                    'serviceBonuses',
                    rules.serviceBonuses.map((x, j) => (j === i ? { ...x, points: toInt(e.target.value) } : x))
                  )
                }
              />
              <span className="text-sm text-muted-foreground">pts</span>
              <button
                type="button"
                onClick={() => set('serviceBonuses', rules.serviceBonuses.filter((_, j) => j !== i))}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                title="Remover bônus"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!nextBonusProduct}
            onClick={() =>
              nextBonusProduct &&
              set('serviceBonuses', [...rules.serviceBonuses, { productId: nextBonusProduct.id, points: 10 }])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar bônus
          </Button>
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground">Cadastre serviços em Produtos pra configurar bônus.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faixas</CardTitle>
          <CardDescription>
            O cliente entra na maior faixa cuja pontuação mínima ele atingiu. Use pra filtrar clientes em promoções.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={t.name}
                placeholder="Nome da faixa"
                onChange={(e) =>
                  set('tiers', rules.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">a partir de</span>
              <Input
                type="number"
                min={0}
                className="w-28"
                value={t.minPoints}
                onChange={(e) =>
                  set('tiers', rules.tiers.map((x, j) => (j === i ? { ...x, minPoints: Math.max(0, toInt(e.target.value)) } : x)))
                }
              />
              <span className="text-sm text-muted-foreground">pts</span>
              <button
                type="button"
                onClick={() => set('tiers', rules.tiers.filter((_, j) => j !== i))}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                title="Remover faixa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={rules.tiers.length >= 10}
            onClick={() => {
              const max = rules.tiers.reduce((m, t) => Math.max(m, t.minPoints), 0)
              set('tiers', [...rules.tiers, { name: '', minPoints: max + 100 }])
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar faixa
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulação</CardTitle>
          <CardDescription>Veja quantos pontos um cliente faria com as regras acima (sem bônus por serviço).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input
              type="number"
              min={0}
              className="w-20"
              value={example.visits}
              onChange={(e) => setExample((p) => ({ ...p, visits: Math.max(0, toInt(e.target.value)) }))}
            />
            <span className="text-muted-foreground">visitas, R$</span>
            <Input
              type="number"
              min={0}
              className="w-28"
              value={example.totalSpent}
              onChange={(e) => setExample((p) => ({ ...p, totalSpent: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <span className="text-muted-foreground">gastos e</span>
            <Input
              type="number"
              min={0}
              className="w-20"
              value={example.noShows}
              onChange={(e) => setExample((p) => ({ ...p, noShows: Math.max(0, toInt(e.target.value)) }))}
            />
            <span className="text-muted-foreground">falta(s)</span>
          </div>
          <p className="text-sm">
            Cliente com {example.visits} visita(s) e {formatBRL(example.totalSpent)} gastos ={' '}
            <span className="font-semibold">{exampleScore} pontos</span>
            {exampleTier && <> · faixa <span className="font-semibold">{exampleTier.name}</span></>}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar regras
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-center">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
