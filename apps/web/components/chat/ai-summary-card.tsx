import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_LABEL: Record<string, string> = {
  high: '🔥 Quer comprar logo',
  urgent: '🔥 Urgente',
}

// Resumo da qualificação que a IA escreve ao passar o lead pro vendedor
// (conversations.ai_summary) — mostrado no topo do chat e da gaveta do CRM.
export function AiSummaryCard({
  summary,
  priority,
  className,
}: {
  summary: string | null
  priority?: string | null
  className?: string
}) {
  if (!summary?.trim()) return null
  const priorityLabel = priority ? PRIORITY_LABEL[priority] : undefined

  return (
    <div className={cn('rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm', className)}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Resumo da IA
        </span>
        {priorityLabel && (
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-600">
            {priorityLabel}
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-foreground/90 leading-snug">{summary}</p>
    </div>
  )
}
