export interface KanbanStage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  isClosed: boolean
}

export interface KanbanConversation {
  id: string
  kanbanStageId: string
  status: 'ai_handling' | 'waiting_human' | 'human_handling' | 'closed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  lastMessageAt: string
  contact: {
    id: string
    name: string
    phone: string
  }
  lastMessage?: string
  aiAgentName?: string
  assignedTo?: {
    id: string
    name: string
  }
}
