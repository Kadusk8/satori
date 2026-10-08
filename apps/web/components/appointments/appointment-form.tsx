'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Appointment } from './appointment-utils'
import { getCompletionOptions, type CompletionOptions } from '@/lib/data/appointments'
import { formatBRL } from '@/lib/utils'

type ServiceRow = { productId: string; professionalId: string | null }

const schema = z.object({
  contactName: z.string().min(1, 'Nome obrigatório'),
  contactPhone: z.string().min(8, 'Telefone inválido'),
  date: z.string().min(1, 'Data obrigatória'),
  startTime: z.string().min(1, 'Horário obrigatório'),
  durationMinutes: z.string(),
  title: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']),
})

type FormData = z.infer<typeof schema>

interface AppointmentFormProps {
  appointment?: Appointment | null
  defaultDate?: string
  defaultStartTime?: string
  slotDurationMinutes?: number
  onSave: (data: Omit<Appointment, 'id'> & { id?: string }) => Promise<void>
  onClose: () => void
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'completed', label: 'Concluído' },
  { value: 'no_show', label: 'Não compareceu' },
] as const

export function AppointmentForm({
  appointment,
  defaultDate,
  defaultStartTime,
  slotDurationMinutes = 30,
  onSave,
  onClose,
}: AppointmentFormProps) {
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<CompletionOptions | null>(null)
  const [services, setServices] = useState<ServiceRow[]>(appointment?.services ?? [])
  const [servicesError, setServicesError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactName: appointment?.contactName ?? '',
      contactPhone: appointment?.contactPhone ?? '',
      date: appointment?.date ?? defaultDate ?? '',
      startTime: appointment?.startTime ?? defaultStartTime ?? '',
      durationMinutes: String(slotDurationMinutes),
      title: appointment?.title ?? '',
      notes: appointment?.notes ?? '',
      status: appointment?.status ?? 'confirmed',
    },
  })

  const startTime = watch('startTime')
  const duration = watch('durationMinutes')
  const status = watch('status')
  const isCompleted = status === 'completed'

  // Catálogo + equipe só são carregados quando o atendimento vai ser concluído.
  useEffect(() => {
    if (!isCompleted || options) return
    getCompletionOptions()
      .then((opts) => {
        setOptions(opts)
        setServices((prev) =>
          prev.length > 0 || opts.products.length === 0
            ? prev
            : [{ productId: '', professionalId: appointment?.assignedTo ?? opts.currentUserId }]
        )
      })
      .catch(() => setServicesError('Não foi possível carregar o catálogo de serviços.'))
  }, [isCompleted, options, appointment?.assignedTo])

  const priceOf = (productId: string) => options?.products.find((p) => p.id === productId)?.price ?? 0
  const servicesTotal = services.reduce((sum, s) => sum + priceOf(s.productId), 0)

  function updateService(index: number, patch: Partial<ServiceRow>) {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
    setServicesError(null)
  }

  const onSubmit = async (data: FormData) => {
    const filledServices = services.filter((s) => s.productId)
    if (data.status === 'completed' && options && options.products.length > 0 && filledServices.length === 0) {
      setServicesError('Informe pelo menos um serviço realizado.')
      return
    }
    setSaving(true)
    try {
      const endTime = addMinutes(data.startTime, parseInt(data.durationMinutes, 10) || slotDurationMinutes)
      await onSave({
        id: appointment?.id,
        contactId: appointment?.contactId ?? `c${Date.now()}`,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        conversationId: appointment?.conversationId,
        title: data.title || null,
        notes: data.notes || null,
        date: data.date,
        startTime: data.startTime,
        endTime,
        status: data.status,
        assignedTo: appointment?.assignedTo,
        services: data.status === 'completed' && options ? filledServices : undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {appointment ? 'Editar agendamento' : 'Novo agendamento'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Nome do cliente <span className="text-destructive">*</span>
            </label>
            <Input {...register('contactName')} placeholder="João Silva" />
            {errors.contactName && (
              <p className="text-xs text-destructive mt-1">{errors.contactName.message}</p>
            )}
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Telefone <span className="text-destructive">*</span>
            </label>
            <Input {...register('contactPhone')} placeholder="+55 62 9 9999-0000" />
            {errors.contactPhone && (
              <p className="text-xs text-destructive mt-1">{errors.contactPhone.message}</p>
            )}
          </div>

          {/* Data e horário */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Data <span className="text-destructive">*</span>
              </label>
              <Input type="date" {...register('date')} />
              {errors.date && (
                <p className="text-xs text-destructive mt-1">{errors.date.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Horário <span className="text-destructive">*</span>
              </label>
              <Input type="time" {...register('startTime')} />
              {errors.startTime && (
                <p className="text-xs text-destructive mt-1">{errors.startTime.message}</p>
              )}
            </div>
          </div>

          {/* Duração */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Duração (minutos)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                {...register('durationMinutes')}
                min={15}
                max={480}
                step={15}
                className="w-28"
              />
              {startTime && duration && parseInt(duration, 10) > 0 && (
                <span className="text-xs text-muted-foreground">
                  até {addMinutes(startTime, parseInt(duration, 10))}
                </span>
              )}
            </div>
          </div>

          {/* Título / serviço */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Serviço / título</label>
            <Input {...register('title')} placeholder="Ex: Consulta, Corte, Reunião..." />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Observações</label>
            <Textarea {...register('notes')} placeholder="Informações adicionais..." rows={2} />
          </div>

          {/* Status — no novo agendamento permite lançar um atendimento avulso já concluído */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Status</label>
            <select
              {...register('status')}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Serviços realizados — alimentam o histórico do cliente */}
          {isCompleted && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Serviços realizados</label>
                {options && options.products.length > 0 && (
                  <span className="text-xs text-muted-foreground">Total: {formatBRL(servicesTotal)}</span>
                )}
              </div>

              {!options && !servicesError && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando catálogo...
                </p>
              )}

              {options && options.products.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum produto/serviço no catálogo — cadastre em Produtos pra registrar o histórico do cliente.
                </p>
              )}

              {options && options.products.length > 0 && (
                <>
                  {services.map((svc, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                      <select
                        value={svc.productId}
                        onChange={(e) => updateService(i, { productId: e.target.value })}
                        className="min-w-0 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm"
                      >
                        <option value="">Serviço...</option>
                        {options.products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <select
                        value={svc.professionalId ?? ''}
                        onChange={(e) => updateService(i, { professionalId: e.target.value || null })}
                        className="min-w-0 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm"
                      >
                        <option value="">Profissional...</option>
                        {options.professionals.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
                        {svc.productId ? formatBRL(priceOf(svc.productId)) : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setServices((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        title="Remover serviço"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setServices((prev) => [
                        ...prev,
                        { productId: '', professionalId: prev.at(-1)?.professionalId ?? options.currentUserId },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar serviço
                  </Button>
                  <p className="text-xs text-muted-foreground">Valores do catálogo, congelados ao salvar.</p>
                </>
              )}

              {servicesError && <p className="text-xs text-destructive">{servicesError}</p>}
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {appointment ? 'Salvar' : 'Agendar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
