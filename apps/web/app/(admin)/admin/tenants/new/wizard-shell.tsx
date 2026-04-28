'use client'

import { useWizardStore } from '@/lib/wizard/store'
import { StepBusinessInfo } from './steps/step-business-info'
import { StepWhatsappSetup } from './steps/step-whatsapp-setup'
import { StepAiAgentConfig } from './steps/step-ai-agent-config'
import { StepProductsServices } from './steps/step-products-services'
import { StepBusinessHours } from './steps/step-business-hours'
import { StepReviewActivate } from './steps/step-review-activate'
import { CheckCircle2, Circle, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const STEPS = [
  { number: 1, label: 'Negócio' },
  { number: 2, label: 'WhatsApp' },
  { number: 3, label: 'Agente IA' },
  { number: 4, label: 'Produtos' },
  { number: 5, label: 'Horários' },
  { number: 6, label: 'Ativar' },
]

export function WizardShell() {
  const { currentStep, setStep } = useWizardStore()

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Cabeçalho */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/tenants" />}
            nativeButton={false}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Empresas
          </Button>
          <div>
            <h1 className="text-xl font-bold">Nova Empresa</h1>
            <p className="text-sm text-muted-foreground">
              Preencha os dados para configurar a nova empresa
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-8">
          <div className="flex items-center">
            {STEPS.map((step, i) => {
              const isDone = currentStep > step.number
              const isCurrent = currentStep === step.number

              return (
                <div key={step.number} className="flex items-center flex-1 last:flex-none">
                  <button
                    onClick={() => isDone && setStep(step.number)}
                    disabled={!isDone}
                    className={cn(
                      'flex flex-col items-center gap-1 group',
                      isDone && 'cursor-pointer'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors text-xs font-semibold',
                        isDone
                          ? 'border-primary bg-primary text-primary-foreground'
                          : isCurrent
                          ? 'border-primary bg-background text-primary'
                          : 'border-muted-foreground/30 bg-background text-muted-foreground'
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span>{step.number}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-xs hidden sm:block',
                        isCurrent
                          ? 'text-primary font-medium'
                          : isDone
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </button>

                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-2 rounded transition-colors',
                        currentStep > step.number
                          ? 'bg-primary'
                          : 'bg-muted-foreground/20'
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Conteúdo do step */}
        <div className="bg-background rounded-xl border shadow-sm p-6 sm:p-8">
          {currentStep === 1 && <StepBusinessInfo />}
          {currentStep === 2 && <StepWhatsappSetup />}
          {currentStep === 3 && <StepAiAgentConfig />}
          {currentStep === 4 && <StepProductsServices />}
          {currentStep === 5 && <StepBusinessHours />}
          {currentStep === 6 && <StepReviewActivate />}
        </div>
      </div>
    </div>
  )
}
