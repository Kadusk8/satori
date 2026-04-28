'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, ExternalLink, Bot, User, Phone, Clock, Tag, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from '@/components/chat/message-bubble'
import type { ChatMessage } from '@/components/chat/message-bubble'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { KanbanConversation } from './types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface DBMessage {
  id: string
  sender_type: 'customer' | 'ai' | 'human' | 'system'
  content: string | null
  content_type: string
  media_url: string | null
  created_at: string
  contact_id: string
}

interface ContactDetail {
  id: string
  whatsapp_number: string
  whatsapp_name: string | null
  custom_name: string | null
  email: string | null
  tags: string[] | null
  first_contact_at: string | null
  last_contact_at: string | null
  notes: string | null
}

interface ConversationDetail {
  id: string
  status: string
  started_at: string
  last_message_at: string
  ai_agents: { name: string } | null
  contacts: ContactDetail
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  ai_handling: 'IA atendendo',
  waiting_human: 'Aguardando humano',
  human_handling: 'Em atendimento',
  closed: 'Encerrado',
}

const statusClass: Record<string, string> = {
  ai_handling: 'bg-purple-500/10 text-purple-600',
  waiting_human: 'bg-amber-500/10 text-amber-600',
  human_handling: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

// Detecta produtos/serviços mencionados nas últimas mensagens da IA
function extractProductMentions(messages: ChatMessage[]): string[] {
  const aiMessages = messages
    .filter((m) => m.senderType === 'ai' && m.content)
    .slice(-10) // últimas 10 mensagens da IA
  const text = aiMessages.map((m) => m.content ?? '').join(' ')

  // Padrões simples: preços (R$ ...), itens com bullet, nomes em negrito (*texto*)
  const mentions: string[] = []

  // Linhas que mencionam preço
  const priceLines = text.match(/[^\n.]+R\$[^\n.]+/g) ?? []
  priceLines.forEach((line) => {
    const clean = line.replace(/\*+/g, '').trim().slice(0, 60)
    if (clean) mentions.push(clean)
  })

  // Itens com bullet (- ou •)
  const bulletLines = text.match(/[•\-]\s+([^\n]+)/g) ?? []
  bulletLines.forEach((line) => {
    const clean = line.replace(/^[•\-]\s+/, '').replace(/\*+/g, '').trim().slice(0, 60)
    if (clean && !mentions.includes(clean)) mentions.push(clean)
  })

  return mentions.slice(0, 5)
}

// ── Componente ─────────────────────────────────────────────────────────────────

interface ConversationDrawerProps {
  conversation: KanbanConversation | null
  onClose: () => void
}

type Tab = 'chat' | 'lead'

export function ConversationDrawer({ conversation, onClose }: ConversationDrawerProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Carrega mensagens e detalhes quando abre uma conversa
  useEffect(() => {
    if (!conversation) {
      setMessages([])
      setDetail(null)
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      const supabase = createClient()

      // Busca detalhes da conversa + contato
      const { data: convData } = await supabase
        .from('conversations')
        .select(`
          id, status, started_at, last_message_at,
          ai_agents ( name ),
          contacts ( id, whatsapp_number, whatsapp_name, custom_name, email, tags, first_contact_at, last_contact_at, notes )
        `)
        .eq('id', conversation!.id)
        .single()

      // Busca mensagens da conversa
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, sender_type, content, content_type, media_url, created_at, contact_id')
        .eq('conversation_id', conversation!.id)
        .order('created_at', { ascending: true })
        .limit(100)

      if (cancelled) return

      if (convData) setDetail(convData as unknown as ConversationDetail)

      setMessages(
        (msgs ?? []).map((m: DBMessage) => ({
          id: m.id,
          senderType: m.sender_type,
          content: m.content,
          contentType: m.content_type as ChatMessage['contentType'],
          mediaUrl: m.media_url ?? undefined,
          createdAt: m.created_at,
          senderName:
            m.sender_type === 'ai' ? 'Assistente IA' :
            m.sender_type === 'human' ? 'Operador' :
            undefined,
        }))
      )

      setIsLoading(false)
    }

    setActiveTab('chat')
    load()
    return () => { cancelled = true }
  }, [conversation])

  // Scroll para o final quando mensagens carregam
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  const isOpen = conversation !== null

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Drawer lateral */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[480px] max-w-full bg-background border-l shadow-2xl',
          'flex flex-col transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {conversation && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate">{conversation.contact.name}</span>
                  <span className="text-xs text-muted-foreground">{conversation.contact.phone}</span>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', statusClass[conversation.status] ?? 'bg-muted text-muted-foreground')}>
                  {statusLabel[conversation.status] ?? conversation.status}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs h-7"
                  onClick={() => router.push(`/chat/${conversation.id}`)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir chat
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0">
              {([['chat', 'Conversa'], ['lead', 'Lead']] as [Tab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'flex-1 py-2.5 text-sm font-medium transition-colors',
                    activeTab === tab
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Carregando...
                </div>
              ) : activeTab === 'chat' ? (
                <div className="flex flex-col gap-3 p-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem</p>
                  ) : (
                    messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
                  )}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                /* Tab Lead */
                <div className="p-4 flex flex-col gap-4">
                  {/* Dados do contato */}
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contato</h3>
                    <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{detail?.contacts.custom_name ?? detail?.contacts.whatsapp_name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{detail?.contacts.whatsapp_number ?? conversation.contact.phone}</span>
                      </div>
                      {detail?.contacts.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground text-xs">Email:</span>
                          <span>{detail.contacts.email}</span>
                        </div>
                      )}
                      {detail?.contacts.tags && detail.contacts.tags.length > 0 && (
                        <div className="flex items-start gap-2 text-sm">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {detail.contacts.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Linha do tempo */}
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Linha do tempo</h3>
                    <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground text-xs mr-1">Primeiro contato:</span>
                        <span>{formatDate(detail?.contacts.first_contact_at ?? null)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground text-xs mr-1">Última mensagem:</span>
                        <span>{formatDate(detail?.last_message_at ?? conversation.lastMessageAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground text-xs mr-1">Agente:</span>
                        <span>{detail?.ai_agents?.name ?? conversation.aiAgentName ?? '—'}</span>
                      </div>
                    </div>
                  </section>

                  {/* Produtos/serviços de interesse */}
                  {(() => {
                    const mentions = extractProductMentions(messages)
                    if (mentions.length === 0) return null
                    return (
                      <section>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Interesse detectado</h3>
                        <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1.5">
                          {mentions.map((m, i) => (
                            <p key={i} className="text-sm text-foreground">{m}</p>
                          ))}
                        </div>
                      </section>
                    )
                  })()}

                  {/* Anotações */}
                  {detail?.contacts.notes && (
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Anotações</h3>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-sm">{detail.contacts.notes}</p>
                      </div>
                    </section>
                  )}

                  {/* Resumo da conversa */}
                  {messages.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Resumo</h3>
                      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">{messages.length} mensagens trocadas</p>
                        <p className="text-xs text-muted-foreground">
                          {messages.filter((m) => m.senderType === 'customer').length} do cliente ·{' '}
                          {messages.filter((m) => m.senderType === 'ai').length} da IA ·{' '}
                          {messages.filter((m) => m.senderType === 'human').length} do operador
                        </p>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
