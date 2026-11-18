'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateTenantAiSalesMode } from '@/lib/actions/tenant'
import {
  AI_SALES_MODES,
  AI_SALES_MODE_DESCRIPTIONS,
  AI_SALES_MODE_LABELS,
  normalizeAiSalesMode,
  type AiSalesModeSetting,
} from '@/lib/ai-sales-mode'

interface AiSalesModeEditorProps {
  tenantId: string
  currentMode: string | null
}

// Seletor do modo da IA (vendedora x SDR) na tela do tenant no /admin — mesmo controle que o
// dono/admin do tenant vê no topo do CRM.
export function AiSalesModeEditor({ tenantId, currentMode }: AiSalesModeEditorProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AiSalesModeSetting>(normalizeAiSalesMode(currentMode))
  const [loading, setLoading] = useState(false)

  async function handleChange(value: unknown) {
    const next = normalizeAiSalesMode(value)
    const previous = mode
    setMode(next)
    setLoading(true)
    try {
      await updateTenantAiSalesMode(tenantId, next)
      toast.success(`Modo da IA: ${AI_SALES_MODE_LABELS[next]}`)
      router.refresh()
    } catch (e) {
      setMode(previous)
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar o modo da IA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Modo da IA</span>
        <Select value={mode} onValueChange={handleChange} disabled={loading}>
          <SelectTrigger className="h-8 w-[190px]">
            <SelectValue>{(v: unknown) => AI_SALES_MODE_LABELS[normalizeAiSalesMode(v)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AI_SALES_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {AI_SALES_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{AI_SALES_MODE_DESCRIPTIONS[mode]}</p>
    </div>
  )
}
