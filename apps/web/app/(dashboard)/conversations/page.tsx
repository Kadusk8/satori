'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect, useRef } from 'react'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { ConversationDrawer } from '@/components/kanban/conversation-drawer'
import type { KanbanStage, KanbanConversation } from '@/components/kanban/types'
import { Filter, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ── Tipos do banco ────────────────────────────────────────────────────────────

interface DBConversation {
  id: string
  status: string
  priority: string
  last_message_at: string
  kanban_stage_id: string | null
  ai_agents: { name: string } | null
  contacts: { id: string; whatsapp_name: string | null; custom_name: string | null; whatsapp_number: string }
  users: { id: string; full_name: string } | null
  messages: { content: string | null }[]
}

interface DBStage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  is_closed: boolean
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapConversation(row: DBConversation, stages: KanbanStage[]): KanbanConversation {
  const defaultStageId = stages.find((s) => s.slug === 'novo_lead')?.id ?? stages[0]?.id ?? ''
  return {
    id: row.id,
    kanbanStageId: row.kanban_stage_id ?? defaultStageId,
    status: row.status as KanbanConversation['status'],
    priority: (row.priority ?? 'normal') as KanbanConversation['priority'],
    lastMessageAt: row.last_message_at,
    contact: {
      id: row.contacts.id,
      name: row.contacts.custom_name ?? row.contacts.whatsapp_name ?? row.contacts.whatsapp_number,
      phone: row.contacts.whatsapp_number,
    },
    lastMessage: row.messages?.[0]?.content ?? undefined,
    aiAgentName: row.ai_agents?.name ?? undefined,
    assignedTo: row.users ? { id: row.users.id, name: row.users.full_name } : undefined,
  }
}

function mapStage(row: DBStage): KanbanStage {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    position: row.position,
    isClosed: row.is_closed,
  }
}

// ── Tipos de filtro ───────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'ai_handling' | 'waiting_human' | 'human_handling'
type FilterPriority = 'all' | 'urgent' | 'high' | 'normal' | 'low'

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [stages, setStages] = useState<KanbanStage[]>([])
  const [conversations, setConversations] = useState<KanbanConversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [selectedConversation, setSelectedConversation] = useState<KanbanConversation | null>(null)

  // Ref para manter stages atualizadas no callback do Realtime
  const stagesRef = useRef<KanbanStage[]>([])
  stagesRef.current = stages

  // ── Carrega dados iniciais ────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast.error('Usuário não autenticado')
      return
    }

    const tenantId = user.user_metadata?.tenant_id
    if (!tenantId) {
      toast.error('Tenant não encontrado')
      return
    }

    const { data: stagesData, error: stagesError } = await supabase
      .from('kanban_stages')
      .select('id, name, slug, color, position, is_closed')
      .eq('tenant_id', tenantId)
      .order('position')

    if (stagesError) {
      toast.error('Erro ao carregar estágios: ' + stagesError.message)
      return
    }

    const mappedStages = (stagesData ?? []).map(mapStage)
    setStages(mappedStages)

    const { data: convsData, error: convsError } = await supabase
      .from('conversations')
      .select(`
        id, status, priority, last_message_at, kanban_stage_id,
        ai_agents ( name ),
        contacts ( id, whatsapp_name, custom_name, whatsapp_number ),
        users ( id, full_name ),
        messages ( content )
      `)
      .eq('tenant_id', tenantId)
      .not('status', 'eq', 'closed')
      .order('last_message_at', { ascending: false })
      .limit(200)

    if (convsError) {
      toast.error('Erro ao carregar conversas: ' + convsError.message)
      return
    }

    setConversations((convsData ?? []).map((c) => mapConversation(c as unknown as DBConversation, mappedStages)))
  }, [])

  useEffect(() => {
    setIsLoading(true)
    loadData().finally(() => setIsLoading(false))
  }, [loadData])

  // ── Supabase Realtime ─────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('kanban-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old.id))
            return
          }

          // Para INSERT/UPDATE, busca a conversa completa
          const { data } = await supabase
            .from('conversations')
            .select(`
              id, status, priority, last_message_at, kanban_stage_id,
              ai_agents ( name ),
              contacts ( id, whatsapp_name, custom_name, whatsapp_number ),
              users ( id, full_name ),
              messages ( content )
            `)
            .eq('id', payload.new.id)
            .single()

          if (!data) return

          const mapped = mapConversation(data as unknown as DBConversation, stagesRef.current)

          setConversations((prev) => {
            const exists = prev.find((c) => c.id === mapped.id)

            // Remove conversas fechadas do kanban
            if (mapped.status === 'closed') {
              return prev.filter((c) => c.id !== mapped.id)
            }

            if (exists) {
              return prev.map((c) => (c.id === mapped.id ? mapped : c))
            }

            // Nova conversa: notifica operador se aguardando humano
            if (mapped.status === 'waiting_human') {
              toast.warning(`Nova conversa aguardando atendimento — ${mapped.contact.name}`, {
                action: { label: 'Abrir', onClick: () => window.location.href = `/chat/${mapped.id}` },
              })
            }

            return [mapped, ...prev]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Mover card (drag & drop) ──────────────────────────────────────────────

  const handleMoveCard = useCallback(async (conversationId: string, newStageId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, kanbanStageId: newStageId } : c))
    )

    const supabase = createClient()
    const { error } = await supabase
      .from('conversations')
      .update({ kanban_stage_id: newStageId })
      .eq('id', conversationId)

    if (error) {
      toast.error('Erro ao mover card: ' + error.message)
      // Reverte no próximo tick (o Realtime trará o estado correto)
    }
  }, [])

  // ── Refresh manual ────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }, [loadData])

  // ── Filtros ───────────────────────────────────────────────────────────────

  const filteredConversations = conversations.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (
        !c.contact.name.toLowerCase().includes(q) &&
        !c.contact.phone.includes(q) &&
        !(c.lastMessage ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const activeCount = conversations.filter((c) => c.status !== 'closed').length
  const waitingCount = conversations.filter((c) => c.status === 'waiting_human').length
  const hasActiveFilters = filterStatus !== 'all' || filterPriority !== 'all' || filterSearch !== ''

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b bg-background shrink-0">
        <div>
          <h1 className="text-xl font-bold">CRM</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {activeCount} ativas ·{' '}
            <span className={waitingCount > 0 ? 'text-amber-600 font-medium' : ''}>
              {waitingCount} aguardando atendimento
            </span>
            {hasActiveFilters && (
              <span className="ml-2 text-xs text-primary">
                · mostrando {filteredConversations.length} filtradas
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Filtrar
            {hasActiveFilters && (
              <span className="ml-1 h-4 w-4 rounded-full bg-primary-foreground text-primary text-[10px] flex items-center justify-center font-bold">
                !
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Painel de filtros */}
      {showFilters && (
        <div className="flex items-center gap-4 px-8 py-3 border-b bg-muted/30 shrink-0 flex-wrap">
          {/* Busca */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou mensagem..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="h-8 text-sm rounded-md border bg-background px-3 pr-8 outline-none focus:ring-1 focus:ring-primary w-72"
            />
            {filterSearch && (
              <button
                onClick={() => setFilterSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Status:</span>
            {(['all', 'ai_handling', 'waiting_human', 'human_handling'] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {s === 'all' ? 'Todos' : s === 'ai_handling' ? 'IA' : s === 'waiting_human' ? 'Aguardando' : 'Humano'}
              </button>
            ))}
          </div>

          {/* Prioridade */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Prioridade:</span>
            {(['all', 'urgent', 'high', 'normal', 'low'] as FilterPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  filterPriority === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {p === 'all' ? 'Todas' : p === 'urgent' ? 'Urgente' : p === 'high' ? 'Alta' : p === 'normal' ? 'Normal' : 'Baixa'}
              </button>
            ))}
          </div>

          {/* Limpar filtros */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterSearch('') }}
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-hidden px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Carregando conversas...
          </div>
        ) : stages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Nenhum estágio configurado. Configure o kanban nas configurações.
          </div>
        ) : (
          <KanbanBoard
            stages={stages}
            conversations={filteredConversations}
            onMoveCard={handleMoveCard}
            onCardClick={setSelectedConversation}
          />
        )}
      </div>

      <ConversationDrawer
        conversation={selectedConversation}
        onClose={() => setSelectedConversation(null)}
      />
    </div>
  )
}
