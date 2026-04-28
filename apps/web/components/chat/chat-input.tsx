'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    setText('')
    try {
      await onSend(trimmed)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 p-4 border-t bg-background">
      <button
        className="text-muted-foreground hover:text-foreground transition-colors mb-2"
        title="Anexar arquivo"
        type="button"
      >
        <Paperclip className="h-5 w-5" />
      </button>

      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem... (Enter para enviar)"
          disabled={disabled || sending}
          rows={1}
          className={cn(
            'w-full resize-none rounded-xl border bg-muted/50 px-4 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'max-h-32 overflow-y-auto'
          )}
          style={{ minHeight: '44px' }}
        />
      </div>

      <Button
        onClick={handleSend}
        disabled={!text.trim() || sending || disabled}
        size="sm"
        className="h-10 w-10 rounded-xl p-0 shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
