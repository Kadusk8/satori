'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useWizardStore } from '@/lib/wizard/store'
import type { Step2Data } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageSquare, Info } from 'lucide-react'

const schema = z
  .object({
    whatsappNumber: z
      .string()
      .min(10, 'Número inválido')
      .regex(/^\d+$/, 'Apenas números (ex: 5562999999999)'),
    connectionType: z.enum(['baileys', 'cloud_api']),
    evolutionApiUrl: z.string().url('URL inválida (ex: https://evo.servidor.com)'),
    evolutionApiKey: z.string().min(1, 'API Key obrigatória'),
    instanceName: z.string().min(1, 'Nome da instância obrigatório').regex(/^[a-zA-Z0-9_-]+$/, 'Apenas letras, números, _ e -'),
    cloudApiToken: z.string().optional().default(''),
    cloudApiBusinessId: z.string().optional().default(''),
  })
  .refine(
    (d) => {
      if (d.connectionType === 'cloud_api') {
        return d.cloudApiToken.length > 0 && d.cloudApiBusinessId.length > 0
      }
      return true
    },
    {
      message: 'Token e Business ID obrigatórios para Cloud API',
      path: ['cloudApiToken'],
    }
  )

export function StepWhatsappSetup() {
  const { step2, saveStep2, setStep } = useWizardStore()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      whatsappNumber: step2.whatsappNumber ?? '',
      connectionType: step2.connectionType ?? 'baileys',
      evolutionApiUrl: step2.evolutionApiUrl ?? '',
      evolutionApiKey: step2.evolutionApiKey ?? '',
      instanceName: step2.instanceName ?? '',
      cloudApiToken: step2.cloudApiToken ?? '',
      cloudApiBusinessId: step2.cloudApiBusinessId ?? '',
    },
  })

  const connectionType = watch('connectionType')

  return (
    <form onSubmit={handleSubmit(saveStep2)} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
          <MessageSquare className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Configuração do WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Número e tipo de conexão via Evolution API
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Evolution API URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            URL da Evolution API <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="https://evo.seuservidor.com"
            {...register('evolutionApiUrl')}
          />
          {errors.evolutionApiUrl && (
            <p className="text-xs text-destructive">{errors.evolutionApiUrl.message}</p>
          )}
        </div>

        {/* Evolution API Key */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            API Key da Evolution <span className="text-destructive">*</span>
          </label>
          <Input
            type="password"
            placeholder="Chave de acesso da Evolution API"
            {...register('evolutionApiKey')}
          />
          {errors.evolutionApiKey && (
            <p className="text-xs text-destructive">{errors.evolutionApiKey.message}</p>
          )}
        </div>

        {/* Nome da instância */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Nome da instância <span className="text-destructive">*</span>
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
            Identificador único da instância no Evolution API. Use letras, números, _ ou -.
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

        {/* Tipo de conexão */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Tipo de conexão <span className="text-destructive">*</span>
          </label>
          <Select
            value={connectionType}
            onValueChange={(v) =>
              v && setValue('connectionType', v as Step2Data['connectionType'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baileys">
                Baileys (QR Code — gratuito)
              </SelectItem>
              <SelectItem value="cloud_api">
                WhatsApp Cloud API (Meta Business)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Info Baileys */}
        {connectionType === 'baileys' && (
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Conexão via QR Code</p>
            <p>
              Após ativar o tenant, o responsável precisará escanear um QR code
              no painel para conectar o número. A conexão será criada
              automaticamente na Evolution API.
            </p>
          </div>
        )}

        {/* Campos Cloud API */}
        {connectionType === 'cloud_api' && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Credenciais do Meta Business Manager</p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Access Token <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="EAAxxxxxxxxxx..."
                {...register('cloudApiToken')}
              />
              {errors.cloudApiToken && (
                <p className="text-xs text-destructive">
                  {errors.cloudApiToken.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Business ID (Phone Number ID) <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="1234567890"
                {...register('cloudApiBusinessId')}
              />
              {errors.cloudApiBusinessId && (
                <p className="text-xs text-destructive">
                  {errors.cloudApiBusinessId.message}
                </p>
              )}
            </div>
          </div>
        )}
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
