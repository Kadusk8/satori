'use client'

import { useState } from 'react'
import { useWizardStore } from '@/lib/wizard/store'
import type { Step5Data, BusinessHours, DayHours } from '@/lib/wizard/types'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/wizard/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

type DayKey = keyof BusinessHours

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Segunda-feira',
  tue: 'Terça-feira',
  wed: 'Quarta-feira',
  thu: 'Quinta-feira',
  fri: 'Sexta-feira',
  sat: 'Sábado',
  sun: 'Domingo',
}

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (GMT-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (GMT-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
]

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]

export function StepBusinessHours() {
  const { step5, saveStep5, setStep } = useWizardStore()

  const [hours, setHours] = useState<BusinessHours>(
    step5.businessHours ?? DEFAULT_BUSINESS_HOURS
  )
  const [timezone, setTimezone] = useState(
    step5.timezone ?? 'America/Sao_Paulo'
  )
  const [duration, setDuration] = useState(
    step5.appointmentDurationMinutes ?? 30
  )

  const toggleDay = (day: DayKey) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }))
  }

  const updateDayField = (
    day: DayKey,
    field: keyof DayHours,
    value: string | boolean
  ) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))
  }

  const handleSave = () => {
    saveStep5({
      businessHours: hours,
      timezone,
      appointmentDurationMinutes: duration,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
          <Clock className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Horário de Funcionamento</h2>
          <p className="text-sm text-muted-foreground">
            Configure quando o negócio atende
          </p>
        </div>
      </div>

      {/* Tabela de horários */}
      <div className="space-y-2">
        {(Object.keys(DAY_LABELS) as DayKey[]).map((day) => {
          const dayData = hours[day]
          return (
            <div
              key={day}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                !dayData.enabled && 'opacity-50'
              )}
            >
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  'flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors',
                  dayData.enabled
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30 bg-muted'
                )}
              >
                <span
                  className={cn(
                    'block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                    dayData.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  )}
                />
              </button>

              {/* Nome do dia */}
              <span className="w-32 text-sm font-medium shrink-0">
                {DAY_LABELS[day]}
              </span>

              {/* Horários */}
              {dayData.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={dayData.start}
                    onChange={(e) => updateDayField(day, 'start', e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={dayData.end}
                    onChange={(e) => updateDayField(day, 'end', e.target.value)}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Timezone e duração */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fuso horário</label>
          <Select
            value={timezone}
            onValueChange={(v) => v && setTimezone(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Duração padrão do agendamento
          </label>
          <Select
            value={String(duration)}
            onValueChange={(v) => v && setDuration(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} minutos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={() => setStep(4)}>
          ← Voltar
        </Button>
        <Button type="button" onClick={handleSave}>
          Próximo →
        </Button>
      </div>
    </div>
  )
}
