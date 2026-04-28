'use client'

import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bot, User, AlertCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { KanbanConversation } from './types'
import { formatDistanceToNow } from './utils'

interface KanbanCardProps {
  conversation: KanbanConversation
  isDragging?: boolean
  onCardClick?: (conversation: KanbanConversation) => void
}

const priorityConfig = {
  low: { label: 'Baixa', class: 'text-muted-foreground' },
  normal: { label: null, class: '' },
  high: { label: 'Alta', class: 'text-orange-500' },
  urgent: { label: 'Urgente', class: 'text-red-500' },
}

const statusConfig = {
  ai_handling: { label: 'IA', icon: Bot, class: 'text-purple-500' },
  waiting_human: { label: 'Aguardando', icon: AlertCircle, class: 'text-red-500' },
  human_handling: { label: 'Humano', icon: User, class: 'text-blue-500' },
  closed: { label: 'Encerrado', icon: Clock, class: 'text-muted-foreground' },
}

export function KanbanCard({ conversation, isDragging, onCardClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: conversation.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const statusInfo = statusConfig[conversation.status]
  const StatusIcon = statusInfo.icon
  const priorityInfo = priorityConfig[conversation.priority]

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isSortableDragging && !isDragging && onCardClick) {
          onCardClick(conversation)
        }
      }}
      className={cn(
        'group rounded-lg border bg-background p-3 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:border-primary/40 hover:shadow-md transition-all',
        (isSortableDragging || isDragging) && 'opacity-40 ring-2 ring-primary',
        onCardClick && 'cursor-pointer'
      )}
    >
      {/* Nome e prioridade */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/chat/${conversation.id}`}
          className="text-sm font-medium truncate hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {conversation.contact.name}
        </Link>
        {conversation.priority !== 'normal' && (
          <span className={cn('text-xs font-medium shrink-0', priorityInfo.class)}>
            {priorityInfo.label}
          </span>
        )}
      </div>

      {/* Última mensagem */}
      {conversation.lastMessage && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {conversation.lastMessage}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <span className={cn('flex items-center gap-1 text-xs', statusInfo.class)}>
          <StatusIcon className="h-3 w-3" />
          {statusInfo.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(conversation.lastMessageAt)}
        </span>
      </div>

      {/* Telefone */}
      <div className="mt-1">
        <span className="text-xs text-muted-foreground">{conversation.contact.phone}</span>
      </div>
    </div>
  )
}
