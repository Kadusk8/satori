'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWizardStore } from '@/lib/wizard/store'
import { onboardTenant } from '@/lib/actions/onboard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  Rocket,
  Building2,
  MessageSquare,
  Bot,
  ShoppingBag,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type ActivationStep = {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
}

const ACTIVATION_STEPS: ActivationStep[] = [
  { id: 'tenant', label: 'Criando registro da empresa', status: 'pending' },
  { id: 'user', label: 'Criando usuário owner com senha', status: 'pending' },
  { id: 'kanban', label: 'Criando estágios do kanban', status: 'pending' },
  { id: 'evolution', label: 'Criando instância na Evolution API', status: 'pending' },
  { id: 'webhook', label: 'Configurando webhook do WhatsApp', status: 'pending' },
  { id: 'agent', label: 'Criando agente SDR com IA', status: 'pending' },
  { id: 'email', label: 'Enviando email de boas-vindas', status: 'pending' },
]

const DAY_LABELS: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
}

const SEGMENT_LABELS: Record<string, string> = {
  clinica: 'Clínica / Saúde',
  loja: 'Loja',
  restaurante: 'Restaurante',
  servicos: 'Serviços',
  outro: 'Outro',
}

const PERSONALITY_LABELS: Record<string, string> = {
  simpatico: 'Simpático e Proativo',
  formal: 'Formal e Profissional',
  descontraido: 'Descontraído e Divertido',
  tecnico: 'Técnico e Objetivo',
}

export function StepReviewActivate() {
  const router = useRouter()
  const { step1, step2, step3, step4, step5, setStep, reset } = useWizardStore()

  const [activationSteps, setActivationSteps] = useState<ActivationStep[]>(ACTIVATION_STEPS)
  const [isActivating, setIsActivating] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const updateStep = (id: string, status: ActivationStep['status']) => {
    setActivationSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    )
  }

  const handleActivate = async () => {
    setIsActivating(true)

    const payload = { step1, step2, step3, step4, step5 }

    // Anima os steps visualmente enquanto a edge function roda em background
    let stepIndex = 0
    const animationInterval = setInterval(() => {
      if (stepIndex < ACTIVATION_STEPS.length) {
        updateStep(ACTIVATION_STEPS[stepIndex].id, 'running')
        stepIndex++
      } else {
        clearInterval(animationInterval)
      }
    }, 800)

    try {
      // Uma única chamada para a edge function (ela executa tudo internamente)
      await onboardTenant(payload as any)

      clearInterval(animationInterval)
      // Marca todos como done
      setActivationSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })))

      setIsDone(true)
      toast.success('Empresa ativada com sucesso!')
      reset()
      setTimeout(() => router.push('/admin/tenants'), 2000)
    } catch (err) {
      clearInterval(animationInterval)
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      // Marca o step atual como erro
      const failedStep = ACTIVATION_STEPS[Math.max(0, stepIndex - 1)]
      updateStep(failedStep.id, 'error')
      toast.error(message)
      setIsActivating(false)
    }
  }

  const workingDays = step5.businessHours
    ? Object.entries(step5.businessHours)
        .filter(([, v]) => v.enabled)
        .map(([k]) => DAY_LABELS[k])
        .join(', ')
    : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
          <Rocket className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Revisão e Ativação</h2>
          <p className="text-sm text-muted-foreground">
            Confirme os dados e ative a empresa
          </p>
        </div>
      </div>

      {!isActivating && !isDone && (
        <>
          {/* Resumo dos dados */}
          <div className="space-y-4">
            {/* Step 1 */}
            <ReviewSection icon={Building2} title="Negócio" onEdit={() => setStep(1)}>
              <ReviewRow label="Empresa" value={step1.name ?? '—'} />
              <ReviewRow
                label="Segmento"
                value={SEGMENT_LABELS[step1.segment ?? ''] ?? step1.segment ?? '—'}
              />
              <ReviewRow label="Responsável" value={step1.ownerName ?? '—'} />
              <ReviewRow label="Email" value={step1.ownerEmail ?? '—'} />
              <ReviewRow label="Telefone" value={step1.ownerPhone ?? '—'} />
              {step1.city && (
                <ReviewRow label="Cidade" value={`${step1.city}/${step1.state}`} />
              )}
            </ReviewSection>

            {/* Step 2 */}
            <ReviewSection icon={MessageSquare} title="WhatsApp" onEdit={() => setStep(2)}>
              <ReviewRow label="Número" value={step2.whatsappNumber ?? '—'} />
              <ReviewRow
                label="Conexão"
                value={step2.connectionType === 'cloud_api' ? 'WhatsApp Cloud API' : 'Baileys (QR Code)'}
              />
              <ReviewRow label="Evolution URL" value={step2.evolutionApiUrl ?? '—'} />
              <ReviewRow label="Instância" value={step2.instanceName ?? '—'} />
            </ReviewSection>

            {/* Step 3 */}
            <ReviewSection icon={Bot} title="Agente de IA" onEdit={() => setStep(3)}>
              <ReviewRow label="Nome" value={step3.agentName ?? '—'} />
              <ReviewRow
                label="Personalidade"
                value={PERSONALITY_LABELS[step3.personality ?? ''] ?? '—'}
              />
            </ReviewSection>

            {/* Step 4 */}
            <ReviewSection icon={ShoppingBag} title="Produtos" onEdit={() => setStep(4)}>
              {step4.skipped ? (
                <span className="text-sm text-muted-foreground">
                  Pulado — cadastrar depois
                </span>
              ) : (
                <ReviewRow
                  label="Quantidade"
                  value={`${step4.products?.length ?? 0} produto(s) cadastrado(s)`}
                />
              )}
            </ReviewSection>

            {/* Step 5 */}
            <ReviewSection icon={Clock} title="Horários" onEdit={() => setStep(5)}>
              <ReviewRow label="Dias ativos" value={workingDays} />
              <ReviewRow
                label="Duração agendamento"
                value={`${step5.appointmentDurationMinutes ?? 30} min`}
              />
              <ReviewRow
                label="Fuso horário"
                value={step5.timezone ?? 'America/Sao_Paulo'}
              />
            </ReviewSection>
          </div>

          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(5)}>
              ← Voltar
            </Button>
            <Button onClick={handleActivate} className="gap-2">
              <Rocket className="h-4 w-4" />
              Ativar Empresa
            </Button>
          </div>
        </>
      )}

      {/* Tela de progresso da ativação */}
      {(isActivating || isDone) && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground mb-4">
            {isDone
              ? 'Empresa ativada com sucesso!'
              : 'Configurando a empresa, aguarde...'}
          </p>

          {activationSteps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 py-1">
              {step.status === 'pending' && (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              {step.status === 'running' && (
                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              )}
              {step.status === 'done' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
              {step.status === 'error' && (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span
                className={cn(
                  'text-sm',
                  step.status === 'pending' && 'text-muted-foreground/60',
                  step.status === 'running' && 'text-foreground font-medium',
                  step.status === 'done' && 'text-foreground',
                  step.status === 'error' && 'text-destructive'
                )}
              >
                {step.label}
              </span>
            </div>
          ))}

          {isDone && (
            <div className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4 text-sm text-emerald-700 dark:text-emerald-400">
              Empresa criada! Redirecionando para a lista de empresas...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Componentes auxiliares do resumo
function ReviewSection({
  icon: Icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ElementType
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-primary hover:underline"
        >
          Editar
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
