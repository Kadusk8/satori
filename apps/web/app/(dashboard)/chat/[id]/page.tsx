'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bot,
  User,
  UserCheck,
  MoreVertical,
  Phone,
  Tag,
  Clock,
  X,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ChatInput } from '@/components/chat/chat-input'
import type { ChatMessage } from '@/components/chat/message-bubble'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DBMessage {
  id: string
  sender_type: 'customer' | 'ai' | 'human' | 'system'
  content: string | null
  content_type: string
  media_url: string | null
  created_at: string
  contact_id: string
}

interface DBConversation {
  id: string
  status: string
  priority: string
  ai_agents: { name: string } | null
  contacts: {
    id: string
    whatsapp_name: string | null
    custom_name: string | null
    whatsapp_number: string
  }
  users: { id: string; full_name: string } | null
}

const statusConfig = {
  ai_handling: { label: 'IA atendendo', icon: Bot, class: 'bg-purple-500/10 text-purple-600' },
  waiting_human: { label: 'Aguardando humano', icon: Clock, class: 'bg-amber-500/10 text-amber-600' },
  human_handling: { label: 'Em atendimento', icon: UserCheck, class: 'bg-blue-500/10 text-blue-600' },
  closed: { label: 'Encerrado', icon: CheckCircle2, class: 'bg-muted text-muted-foreground' },
}

function mapMessage(row: DBMessage, contactId: string): ChatMessage {
  let senderName: string | undefined
  if (row.sender_type === 'human') senderName = 'Operador'
  else if (row.sender_type === 'ai') senderName = 'Assistente IA'
  else if (row.sender_type === 'system') senderName = undefined

  return {
    id: row.id,
    senderType: row.sender_type,
    content: row.content,
    contentType: row.content_type as ChatMessage['contentType'],
    mediaUrl: row.media_url ?? undefined,
    createdAt: row.created_at,
    senderName,
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversation, setConversation] = useState<DBConversation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isAssuming, setIsAssuming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contactIdRef = useRef<string>('')

  // ── Carrega conversa e mensagens ────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const supabase = createClient()

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select(`
          id, status, priority,
          ai_agents ( name ),
          contacts ( id, whatsapp_name, custom_name, whatsapp_number ),
          users ( id, full_name )
        `)
        .eq('id', conversationId)
        .single()

      if (convError || !conv) {
        toast.error('Conversa não encontrada')
        router.push('/conversations')
        return
      }

      setConversation(conv as unknown as DBConversation)
      contactIdRef.current = (conv as unknown as DBConversation).contacts.id

      const { data: msgs, error: msgsError } = await supabase
        .from('messages')
        .select('id, sender_type, content, content_type, media_url, created_at, contact_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (msgsError) {
        toast.error('Erro ao carregar mensagens')
      } else {
        setMessages((msgs ?? []).map((m) => mapMessage(m as unknown as DBMessage, contactIdRef.current)))
      }

      setIsLoading(false)
    }

    load()
  }, [conversationId, router])

  // ── Scroll automático ────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Realtime: novas mensagens ────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Busca mensagem completa
          const { data } = await supabase
            .from('messages')
            .select('id, sender_type, content, content_type, media_url, created_at, contact_id')
            .eq('id', payload.new.id)
            .single()

          if (!data) return

          const mapped = mapMessage(data as unknown as DBMessage, contactIdRef.current)

          setMessages((prev) => {
            // Evita duplicatas (otimismo local + Realtime)
            if (prev.find((m) => m.id === mapped.id)) return prev
            return [...prev, mapped]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          setConversation((prev) => prev ? { ...prev, status: payload.new.status } : prev)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  // ── Enviar mensagem (operador humano) ───────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    if (!conversation) return

    // Adiciona otimisticamente
    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id: tempId,
      senderType: 'human',
      content: text,
      contentType: 'text',
      createdAt: new Date().toISOString(),
      senderName: 'Você',
    }
    setMessages((prev) => [...prev, optimistic])
    setIsSending(true)

    try {
      const res = await fetch('/api/conversations/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro ao enviar mensagem')
      }

      // Remove o otimístico (Realtime trará a mensagem real com ID correto)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setIsSending(false)
    }
  }, [conversation, conversationId])

  // ── Assumir conversa ────────────────────────────────────────────────────

  const handleAssume = useCallback(async () => {
    setIsAssuming(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'human_handling' })
      .eq('id', conversationId)

    if (error) {
      toast.error('Erro ao assumir conversa: ' + error.message)
    } else {
      toast.success('Conversa assumida. Você está no controle.')
      setConversation((prev) => prev ? { ...prev, status: 'human_handling' } : prev)
    }
    setIsAssuming(false)
  }, [conversationId])

  // ── Encerrar conversa ───────────────────────────────────────────────────

  const handleClose = useCallback(async () => {
    setIsClosing(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', conversationId)

    if (error) {
      toast.error('Erro ao encerrar: ' + error.message)
    } else {
      toast.success('Conversa encerrada.')
      router.push('/conversations')
    }
    setIsClosing(false)
  }, [conversationId, router])

  // ── Renderização ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">
        Carregando conversa...
      </div>
    )
  }

  if (!conversation) return null

  const contact = conversation.contacts
  const contactName = contact.custom_name ?? contact.whatsapp_name ?? contact.whatsapp_number
  const convStatus = (conversation.status ?? 'ai_handling') as keyof typeof statusConfig
  const statusInfo = statusConfig[convStatus] ?? statusConfig.ai_handling
  const StatusIcon = statusInfo.icon

  const canSend = convStatus === 'human_handling'
  const canAssume = convStatus === 'ai_handling' || convStatus === 'waiting_human'

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-background shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => router.push('/conversations')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate">{contactName}</h2>
            <span className={cn('flex items-center gap-1 text-xs rounded-full px-2 py-0.5 shrink-0', statusInfo.class)}>
              <StatusIcon className="h-3 w-3" />
              {statusInfo.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3" />
            {contact.whatsapp_number}
            {conversation.ai_agents && (
              <span className="ml-2 text-purple-500">· {conversation.ai_agents.name}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Tag className="h-3.5 w-3.5" />
            Etiquetar
          </Button>

          {canAssume && (
            <Button
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={handleAssume}
              disabled={isAssuming}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {isAssuming ? 'Assumindo...' : 'Assumir'}
            </Button>
          )}

          {convStatus !== 'closed' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive"
              onClick={handleClose}
              disabled={isClosing}
            >
              <X className="h-3.5 w-3.5" />
              {isClosing ? 'Encerrando...' : 'Encerrar'}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Nenhuma mensagem ainda.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={!canSend || isSending}
      />

      {/* Aviso quando não pode enviar */}
      {!canSend && convStatus !== 'closed' && (
        <div className="px-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">
            {convStatus === 'ai_handling'
              ? <>A IA está atendendo. Clique em <strong className="text-foreground">Assumir</strong> para entrar na conversa.</>
              : <>Conversa aguardando atendimento. Clique em <strong className="text-foreground">Assumir</strong> para atender.</>
            }
          </p>
        </div>
      )}
    </div>
  )
}
