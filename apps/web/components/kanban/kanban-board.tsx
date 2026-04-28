'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import type { KanbanStage, KanbanConversation } from './types'

interface KanbanBoardProps {
  stages: KanbanStage[]
  conversations: KanbanConversation[]
  onMoveCard: (conversationId: string, newStageId: string) => Promise<void>
  onCardClick?: (conversation: KanbanConversation) => void
}

export function KanbanBoard({ stages, conversations, onMoveCard, onCardClick }: KanbanBoardProps) {
  const [activeConversation, setActiveConversation] = useState<KanbanConversation | null>(null)
  // Otimismo: cópia local para atualizar imediatamente antes do servidor confirmar
  const [localConversations, setLocalConversations] = useState<KanbanConversation[]>(conversations)

  // Sincroniza quando a prop muda (Realtime ou refresh)
  useEffect(() => {
    setLocalConversations(conversations)
  }, [conversations])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const conv = localConversations.find((c) => c.id === event.active.id)
    setActiveConversation(conv ?? null)
  }, [localConversations])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Descobre para qual stage o card está sendo arrastado
    const targetStageId = stages.find((s) => s.id === overId)?.id
      ?? localConversations.find((c) => c.id === overId)?.kanbanStageId

    if (!targetStageId) return

    setLocalConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, kanbanStageId: targetStageId } : c
      )
    )
  }, [stages, localConversations])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveConversation(null)

    if (!over) {
      // Reverte se soltar fora
      setLocalConversations(conversations)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    const targetStageId =
      stages.find((s) => s.id === overId)?.id ??
      localConversations.find((c) => c.id === overId)?.kanbanStageId

    if (!targetStageId) {
      setLocalConversations(conversations)
      return
    }

    const originalConv = conversations.find((c) => c.id === activeId)
    if (originalConv?.kanbanStageId === targetStageId) return

    try {
      await onMoveCard(activeId, targetStageId)
    } catch {
      // Reverte em caso de erro
      setLocalConversations(conversations)
    }
  }, [stages, conversations, localConversations, onMoveCard])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageConversations = localConversations.filter(
            (c) => c.kanbanStageId === stage.id
          )
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              conversations={stageConversations}
              onCardClick={onCardClick}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeConversation ? (
          <KanbanCard conversation={activeConversation} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
