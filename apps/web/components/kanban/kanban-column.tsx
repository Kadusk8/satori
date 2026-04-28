'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './kanban-card'
import type { KanbanStage, KanbanConversation } from './types'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  stage: KanbanStage
  conversations: KanbanConversation[]
  onCardClick?: (conversation: KanbanConversation) => void
}

export function KanbanColumn({ stage, conversations, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Header da coluna */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <h3 className="text-sm font-semibold flex-1 truncate">{stage.name}</h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
          {conversations.length}
        </span>
      </div>

      {/* Área droppable */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col gap-2 min-h-[120px] rounded-lg p-2 transition-colors',
          isOver ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-muted/40'
        )}
      >
        <SortableContext
          items={conversations.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {conversations.map((conv) => (
            <KanbanCard key={conv.id} conversation={conv} onCardClick={onCardClick} />
          ))}
        </SortableContext>

        {conversations.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-xs text-muted-foreground">Nenhuma conversa</p>
          </div>
        )}
      </div>
    </div>
  )
}
