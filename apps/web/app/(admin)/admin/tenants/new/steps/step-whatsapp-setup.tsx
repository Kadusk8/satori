'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useWizardStore } from '@/lib/wizard/store'
import type { Step2Data } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, Info } from 'lucide-react'

const schema = z.object({
  whatsappNumber: z
    .string()
    .min(10, 'Número inválido')
    .regex(/^\d+$/, 'Apenas números (ex: 5562999999999)'),
  evolutionApiUrl: z.string().url('URL inválida (ex: https://evo.seuservidor.com)'),
  evolutionApiKey: z.string().min(1, 'Token da instância obrigatório'),
  instanceName: z.string().min(1, 'Nome da instância obrigatório').regex(/^[a-zA-Z0-9_-]+$/, 'Apenas letras, números, _ e -'),
})

export function StepWhatsappSetup() {
  const { step2, saveStep2, setStep } = useWizardStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      whatsappNumber: step2.whatsappNumber ?? '',
      evolutionApiUrl: step2.evolutionApiUrl ?? '',
      evolutionApiKey: step2.evolutionApiKey ?? '',
      instanceName: step2.instanceName ?? '',
    },
  })

  return (
    <form onSubmit={handleSubmit(saveStep2)} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
          <MessageSquare className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Configuração do WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Conexão com a instância Evolution Go do cliente
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">A instância já precisa existir</p>
        <p>
          O cliente cria e conecta a instância no Evolution Go dele (fora da
          nossa plataforma) antes deste passo. Aqui só validamos a conexão
          com as credenciais informadas e registramos nosso webhook — não
          criamos instância nem mostramos QR code.
        </p>
      </div>

      <div className="space-y-4">
        {/* Evolution Go URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            URL do Evolution Go <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="https://evo.seuservidor.com"
            {...register('evolutionApiUrl')}
          />
          {errors.evolutionApiUrl && (
            <p className="text-xs text-destructive">{errors.evolutionApiUrl.message}</p>
          )}
        </div>

        {/* Token da instância */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Token da instância <span className="text-destructive">*</span>
          </label>
          <Input
            type="password"
            placeholder="Token gerado na criação da instância (não é a chave global do servidor)"
            {...register('evolutionApiKey')}
          />
          {errors.evolutionApiKey && (
            <p className="text-xs text-destructive">{errors.evolutionApiKey.message}</p>
          )}
        </div>

        {/* Nome da instância */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Nome/ID da instância <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="minha-empresa (sem espaços)"
            {...register('instanceName')}
          />
          {errors.instanceName && (
            <p className="text-xs text-destructive">{errors.instanceName.message}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            O mesmo nome/ID usado ao criar a instância no Evolution Go do cliente.
          </p>
        </div>

        {/* Número */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Número do WhatsApp <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="5562999999999 (com DDI e DDD, sem espaços)"
            {...register('whatsappNumber')}
          />
          {errors.whatsappNumber && (
            <p className="text-xs text-destructive">{errors.whatsappNumber.message}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Formato: DDI + DDD + número. Ex: 5562999999999
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={() => setStep(1)}>
          ← Voltar
        </Button>
        <Button type="submit">Próximo →</Button>
      </div>
    </form>
  )
}
