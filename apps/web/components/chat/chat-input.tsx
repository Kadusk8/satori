'use client'

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react'
import { Send, Paperclip, Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { toast } from 'sonner'

export interface MediaAttachment {
  contentType: 'image' | 'audio' | 'document'
  url: string
  fileName: string
}

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onSendMedia: (attachment: MediaAttachment) => Promise<void>
  onSendLocation: () => Promise<void>
  disabled?: boolean
}

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB — limite generoso pra documento; WhatsApp já limita mídia a 16MB/100MB conforme tipo

function classifyFile(file: File): 'image' | 'audio' | 'document' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

export function ChatInput({ onSend, onSendMedia, onSendLocation, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendingLocation, setSendingLocation] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite selecionar o mesmo arquivo de novo depois
    if (!file || uploading) return

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande (máx 15 MB)')
      return
    }

    const contentType = classifyFile(file)
    setUploading(true)
    try {
      const uploaded = await uploadToCloudinary(file, contentType, 'zapagent/chat-attachments')
      await onSendMedia({ contentType, url: uploaded.url, fileName: uploaded.fileName })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  const handleSendLocation = async () => {
    if (sendingLocation) return
    setSendingLocation(true)
    try {
      await onSendLocation()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar localização')
    } finally {
      setSendingLocation(false)
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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />
      <button
        className="text-muted-foreground hover:text-foreground transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Anexar arquivo"
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
      </button>

      <button
        className="text-muted-foreground hover:text-foreground transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Enviar localização do estabelecimento"
        type="button"
        disabled={disabled || sendingLocation}
        onClick={handleSendLocation}
      >
        {sendingLocation ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
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
