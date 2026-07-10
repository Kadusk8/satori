'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { updateTenantBusinessHours } from '@/lib/actions/tenant'

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
]

interface DayHours {
  enabled: boolean
  start: string
  end: string
}

interface BusinessHoursEditorProps {
  tenantId: string
  currentBusinessHours: Record<string, { enabled?: boolean; start?: string; end?: string }> | null
  currentTimezone: string
  currentAppointmentDurationMinutes: number
}

export function BusinessHoursEditor({
  tenantId,
  currentBusinessHours,
  currentTimezone,
  currentAppointmentDurationMinutes,
}: BusinessHoursEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [hours, setHours] = useState<Record<string, DayHours>>(() => {
    const initial: Record<string, DayHours> = {}
    for (const { key } of DAYS) {
      const existing = currentBusinessHours?.[key]
      initial[key] = {
        enabled: existing?.enabled ?? false,
        start: existing?.start ?? '08:00',
        end: existing?.end ?? '18:00',
      }
    }
    return initial
  })
  const [timezone, setTimezone] = useState(currentTimezone)
  const [duration, setDuration] = useState(String(currentAppointmentDurationMinutes))

  function updateDay(key: string, patch: Partial<DayHours>) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function handleSave() {
    setLoading(true)
    try {
      await updateTenantBusinessHours(tenantId, {
        businessHours: hours,
        timezone: timezone.trim() || 'America/Sao_Paulo',
        appointmentDurationMinutes: Number(duration) || 30,
      })
      toast.success('Horários salvos')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Editar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Horário de atendimento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hours[key].enabled}
                      onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                  <Input
                    type="time"
                    value={hours[key].start}
                    onChange={(e) => updateDay(key, { start: e.target.value })}
                    disabled={!hours[key].enabled}
                    className="text-xs"
                  />
                  <span className="text-muted-foreground text-xs">até</span>
                  <Input
                    type="time"
                    value={hours[key].end}
                    onChange={(e) => updateDay(key, { end: e.target.value })}
                    disabled={!hours[key].enabled}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fuso horário</label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Sao_Paulo" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duração agendamento (min)</label>
                <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A IA atende 24/7 independente destes horários — eles valem só pra agenda de atendimento presencial/agendamentos.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
