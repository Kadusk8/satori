'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useWizardStore } from '@/lib/wizard/store'
import type { Step1Data } from '@/lib/wizard/types'
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
import { Building2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Nome da empresa obrigatório'),
  segment: z.enum(['clinica', 'loja', 'restaurante', 'servicos', 'outro'], {
    error: 'Selecione o segmento',
  }),
  description: z.string().optional().default(''),
  ownerName: z.string().min(2, 'Nome do responsável obrigatório'),
  ownerEmail: z.string().email('Email inválido'),
  ownerPassword: z.string().min(6, 'Senha mínima de 6 caracteres'),
  ownerPhone: z.string().min(10, 'Telefone inválido'),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  website: z.string().optional().default(''),
})

export function StepBusinessInfo() {
  const { step1, saveStep1 } = useWizardStore()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: step1.name ?? '',
      segment: step1.segment ?? undefined,
      description: step1.description ?? '',
      ownerName: step1.ownerName ?? '',
      ownerEmail: step1.ownerEmail ?? '',
      ownerPassword: step1.ownerPassword ?? '',
      ownerPhone: step1.ownerPhone ?? '',
      address: step1.address ?? '',
      city: step1.city ?? '',
      state: step1.state ?? '',
      website: step1.website ?? '',
    },
  })

  const segment = watch('segment')

  return (
    <form onSubmit={handleSubmit(saveStep1)} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Informações do Negócio</h2>
          <p className="text-sm text-muted-foreground">Dados básicos do cliente</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nome da empresa */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">
            Nome da empresa <span className="text-destructive">*</span>
          </label>
          <Input placeholder="Ex: Clínica Saúde & Vida" {...register('name')} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Segmento */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Segmento <span className="text-destructive">*</span>
          </label>
          <Select
            value={segment}
            onValueChange={(v) => v && setValue('segment', v as Step1Data['segment'])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o segmento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clinica">Clínica / Saúde</SelectItem>
              <SelectItem value="loja">Loja / E-commerce</SelectItem>
              <SelectItem value="restaurante">Restaurante / Food</SelectItem>
              <SelectItem value="servicos">Prestação de Serviços</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
          {errors.segment && (
            <p className="text-xs text-destructive">{errors.segment.message}</p>
          )}
        </div>

        {/* Website */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Website</label>
          <Input placeholder="https://www.exemplo.com.br" {...register('website')} />
        </div>

        {/* Descrição */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium">Descrição do negócio</label>
          <Textarea
            placeholder="Descreva brevemente o negócio (produtos, serviços, diferenciais...)"
            rows={3}
            {...register('description')}
          />
        </div>
      </div>

      {/* Dados do responsável */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Responsável
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Nome completo <span className="text-destructive">*</span>
            </label>
            <Input placeholder="João da Silva" {...register('ownerName')} />
            {errors.ownerName && (
              <p className="text-xs text-destructive">{errors.ownerName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Telefone <span className="text-destructive">*</span>
            </label>
            <Input placeholder="(62) 99999-9999" {...register('ownerPhone')} />
            {errors.ownerPhone && (
              <p className="text-xs text-destructive">{errors.ownerPhone.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              placeholder="joao@empresa.com.br"
              {...register('ownerEmail')}
            />
            {errors.ownerEmail && (
              <p className="text-xs text-destructive">{errors.ownerEmail.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Senha de acesso <span className="text-destructive">*</span>
            </label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              {...register('ownerPassword')}
            />
            {errors.ownerPassword && (
              <p className="text-xs text-destructive">{errors.ownerPassword.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Endereço (opcional)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-sm font-medium">Endereço</label>
            <Input placeholder="Rua Exemplo, 123" {...register('address')} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm font-medium">Cidade</label>
            <Input placeholder="Goiânia" {...register('city')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Estado</label>
            <Input placeholder="GO" maxLength={2} {...register('state')} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Próximo →</Button>
      </div>
    </form>
  )
}
