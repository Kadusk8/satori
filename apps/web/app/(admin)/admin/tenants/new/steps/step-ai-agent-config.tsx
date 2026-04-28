'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect } from 'react'
import { useWizardStore } from '@/lib/wizard/store'
import type { Step3Data } from '@/lib/wizard/types'
import { LLM_MODELS } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bot, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

const schema = z.object({
  agentName: z.string().min(2, 'Nome do agente obrigatório'),
  personality: z.enum(['simpatico', 'formal', 'descontraido', 'tecnico']),
  toneDescription: z.string().optional().default(''),
  greetingMessage: z.string().min(5, 'Mensagem de boas-vindas obrigatória'),
  outOfHoursMessage: z.string().min(5, 'Mensagem fora do horário obrigatória'),
  customRules: z.string().optional().default(''),
  llmProvider: z.enum(['openai', 'gemini']),
  llmModel: z.string().min(1, 'Selecione o modelo'),
  llmApiKey: z.string().min(10, 'API key obrigatória'),
})

const PERSONALITY_LABELS: Record<string, string> = {
  simpatico: 'Simpático e Proativo',
  formal: 'Formal e Profissional',
  descontraido: 'Descontraído e Divertido',
  tecnico: 'Técnico e Objetivo',
}

export function StepAiAgentConfig() {
  const { step1, step3, saveStep3, setStep } = useWizardStore()
  const companyName = step1.name ?? 'a empresa'
  const [showKey, setShowKey] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Step3Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      agentName: step3.agentName ?? `Assistente ${companyName}`,
      personality: step3.personality ?? 'simpatico',
      toneDescription: step3.toneDescription ?? '',
      greetingMessage:
        step3.greetingMessage ??
        `Olá! 👋 Bem-vindo(a) à ${companyName}! Sou o assistente virtual. Como posso te ajudar hoje?`,
      outOfHoursMessage:
        step3.outOfHoursMessage ??
        `Olá! No momento estamos fora do horário de atendimento. Deixe sua mensagem que responderemos assim que possível!`,
      customRules: step3.customRules ?? '',
      llmProvider: step3.llmProvider ?? 'openai',
      llmModel: step3.llmModel ?? 'gpt-4o',
      llmApiKey: step3.llmApiKey ?? '',
    },
  })

  const personality = watch('personality')
  const llmProvider = watch('llmProvider')
  const llmModel = watch('llmModel')

  // Atualiza agentName quando companyName muda (se ainda não foi editado)
  useEffect(() => {
    if (!step3.agentName) {
      setValue('agentName', `Assistente ${companyName}`)
    }
  }, [companyName, step3.agentName, setValue])

  // Reseta modelo quando troca de provedor
  const handleProviderChange = (v: string) => {
    const provider = v as Step3Data['llmProvider']
    setValue('llmProvider', provider)
    setValue('llmModel', LLM_MODELS[provider][0]?.value ?? '')
  }

  const availableModels = LLM_MODELS[llmProvider as keyof typeof LLM_MODELS] ?? LLM_MODELS.openai
  const safeModel = availableModels.find((m) => m.value === llmModel)?.value ?? availableModels[0]?.value ?? ''

  return (
    <form onSubmit={handleSubmit(saveStep3)} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
          <Bot className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Configuração do Agente de IA</h2>
          <p className="text-sm text-muted-foreground">
            Personalize o assistente SDR/Vendedor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nome do agente */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Nome do agente <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder={`Assistente ${companyName}`}
            {...register('agentName')}
          />
          {errors.agentName && (
            <p className="text-xs text-destructive">{errors.agentName.message}</p>
          )}
        </div>

        {/* Personalidade */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Personalidade <span className="text-destructive">*</span>
          </label>
          <Select
            value={personality}
            onValueChange={(v) =>
              v && setValue('personality', v as Step3Data['personality'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simpatico">Simpático e Proativo</SelectItem>
              <SelectItem value="formal">Formal e Profissional</SelectItem>
              <SelectItem value="descontraido">Descontraído e Divertido</SelectItem>
              <SelectItem value="tecnico">Técnico e Objetivo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Provedor de IA */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Provedor de IA <span className="text-destructive">*</span>
          </label>
          <Select value={llmProvider} onValueChange={(v) => v && handleProviderChange(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">ChatGPT (OpenAI)</SelectItem>
              <SelectItem value="gemini">Gemini (Google)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Modelo */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Modelo <span className="text-destructive">*</span>
          </label>
          <Select
            value={safeModel}
            onValueChange={(v) => v && setValue('llmModel', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.llmModel && (
            <p className="text-xs text-destructive">{errors.llmModel.message}</p>
          )}
        </div>

        {/* API Key */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">
            API Key {llmProvider === 'openai' ? '(OpenAI)' : '(Google AI Studio)'}{' '}
            <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder={llmProvider === 'openai' ? 'sk-...' : 'AIza...'}
              className="pr-10"
              {...register('llmApiKey')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((s) => !s)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.llmApiKey && (
            <p className="text-xs text-destructive">{errors.llmApiKey.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {llmProvider === 'openai'
              ? 'Obtenha em platform.openai.com → API Keys'
              : 'Obtenha em aistudio.google.com → Get API Key'}
          </p>
        </div>

        {/* Tom de voz */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">Tom de voz (opcional)</label>
          <Textarea
            placeholder={`Descreva como o agente deve se comunicar. Ex: "Sempre use linguagem simples, evite termos técnicos, chame o cliente pelo primeiro nome..."`}
            rows={2}
            {...register('toneDescription')}
          />
        </div>

        {/* Mensagem de boas-vindas */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">
            Mensagem de boas-vindas <span className="text-destructive">*</span>
          </label>
          <Textarea
            rows={3}
            {...register('greetingMessage')}
          />
          {errors.greetingMessage && (
            <p className="text-xs text-destructive">{errors.greetingMessage.message}</p>
          )}
        </div>

        {/* Mensagem fora do horário */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">
            Mensagem fora do horário <span className="text-destructive">*</span>
          </label>
          <Textarea
            rows={3}
            {...register('outOfHoursMessage')}
          />
          {errors.outOfHoursMessage && (
            <p className="text-xs text-destructive">
              {errors.outOfHoursMessage.message}
            </p>
          )}
        </div>

        {/* Regras customizadas */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">
            Regras específicas (opcional)
          </label>
          <Textarea
            placeholder={`Ex: "Nunca ofereça desconto sem autorização"\n"Sempre pergunte o nome antes de mostrar produtos"\n"Se o cliente mencionar dor, peça para ligar imediatamente"`}
            rows={4}
            {...register('customRules')}
          />
          <p className="text-xs text-muted-foreground">
            Uma regra por linha. Serão adicionadas ao prompt do agente.
          </p>
        </div>
      </div>

      {/* Preview da personalidade */}
      <div className="rounded-lg bg-muted p-3 text-sm">
        <span className="font-medium">Personalidade selecionada: </span>
        <span className="text-muted-foreground">{PERSONALITY_LABELS[personality]}</span>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={() => setStep(2)}>
          ← Voltar
        </Button>
        <Button type="submit">Próximo →</Button>
      </div>
    </form>
  )
}
