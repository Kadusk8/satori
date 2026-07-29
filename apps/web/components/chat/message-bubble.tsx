'use client'

import { Bot, FileText, MapPin, User, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChatMessage {
  id: string
  senderType: 'customer' | 'ai' | 'human' | 'system'
  content: string | null
  contentType: 'text' | 'image' | 'audio' | 'document' | 'location'
  mediaUrl?: string | null
  createdAt: string
  senderName?: string
}

function formatTime(dateStr: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(dateStr)
  )
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isCustomer = message.senderType === 'customer'
  const isSystem = message.senderType === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2 items-end', isCustomer ? 'flex-row' : 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
          isCustomer
            ? 'bg-muted text-muted-foreground'
            : message.senderType === 'ai'
            ? 'bg-purple-500/10 text-purple-500'
            : 'bg-blue-500/10 text-blue-500'
        )}
      >
        {isCustomer ? (
          <User className="h-3.5 w-3.5" />
        ) : message.senderType === 'ai' ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <UserCheck className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Balão */}
      <div className={cn('flex flex-col gap-1 max-w-[75%]', isCustomer ? 'items-start' : 'items-end')}>
        {message.senderName && (
          <span className="text-xs text-muted-foreground px-1">{message.senderName}</span>
        )}

        {message.contentType === 'image' && message.mediaUrl ? (
          <div
            className={cn(
              'rounded-2xl overflow-hidden',
              isCustomer ? 'rounded-bl-sm' : 'rounded-br-sm'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.mediaUrl}
              alt="imagem"
              className="max-w-xs max-h-64 object-cover"
            />
            {message.content && (
              <div className={cn('px-3 py-2 text-sm', isCustomer ? 'bg-muted' : 'bg-primary text-primary-foreground')}>
                {message.content}
              </div>
            )}
          </div>
        ) : message.contentType === 'audio' && message.mediaUrl ? (
          <div className={cn('rounded-2xl px-3 py-2', isCustomer ? 'bg-muted' : 'bg-primary/10')}>
            <audio controls src={message.mediaUrl} className="max-w-[240px] h-10" />
          </div>
        ) : message.contentType === 'document' && message.mediaUrl ? (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm underline-offset-2 hover:underline',
              isCustomer
                ? 'bg-muted text-foreground rounded-bl-sm'
                : 'bg-primary text-primary-foreground rounded-br-sm'
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            {message.content || 'Documento'}
          </a>
        ) : message.contentType === 'location' ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm',
              isCustomer ? 'bg-muted text-foreground rounded-bl-sm' : 'bg-primary text-primary-foreground rounded-br-sm'
            )}
          >
            <MapPin className="h-4 w-4 shrink-0" />
            {message.content || 'Localização enviada'}
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm',
              isCustomer
                ? 'bg-muted text-foreground rounded-bl-sm'
                : 'bg-primary text-primary-foreground rounded-br-sm'
            )}
          >
            {message.content ?? '(sem conteúdo)'}
          </div>
        )}

        <span className="text-xs text-muted-foreground px-1">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  )
}
