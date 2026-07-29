'use client'

import { useState } from 'react'
import { History, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseWhatsAppExport, getDistinctSenders, type ParsedWaMessage } from '@/lib/whatsapp-export-parser'
import { importWhatsAppHistory } from '@/lib/data/chat'
import { toast } from 'sonner'

interface ImportHistoryDialogProps {
  conversationId: string
  contactName: string
  onImported: () => void
}

export function ImportHistoryDialog({ conversationId, contactName, onImported }: ImportHistoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [rawText, setRawText] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedWaMessage[] | null>(null)
  const [senders, setSenders] = useState<string[]>([])
  const [customerSender, setCustomerSender] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [importing, setImporting] = useState(false)

  function reset() {
    setRawText(null)
    setParsed(null)
    setSenders([])
    setCustomerSender('')
    setFileName('')
  }

  async function handleFile(file: File) {
    const text = await file.text()
    const messages = parseWhatsAppExport(text)
    if (messages.length === 0) {
      toast.error('Não foi possível reconhecer mensagens nesse arquivo. Confira se é o .txt exportado pelo WhatsApp (sem mídia).')
      return
    }
    const distinct = getDistinctSenders(messages)
    // Melhor palpite: nome do remetente mais parecido com o nome já salvo do contato.
    const bestMatch =
      distinct.find((s) => s.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(s.toLowerCase())) ??
      distinct[0]

    setRawText(text)
    setParsed(messages)
    setSenders(distinct)
    setCustomerSender(bestMatch)
    setFileName(file.name)
  }

  async function handleImport() {
    if (!rawText || !parsed || !customerSender) return
    setImporting(true)
    try {
      const { imported } = await importWhatsAppHistory(conversationId, rawText, customerSender)
      toast.success(`${imported} mensagens importadas.`)
      setOpen(false)
      reset()
      onImported()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar histórico')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger render={
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
          <History className="h-3.5 w-3.5" />
          Importar histórico
        </Button>
      } />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar histórico do WhatsApp</DialogTitle>
          <DialogDescription>
            Envie o arquivo .txt gerado em <strong>Exportar conversa</strong> (sem mídia) no WhatsApp do celular.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 px-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">Clique para selecionar o .txt</span>
            <input
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{fileName}</strong> — {parsed.length} mensagens encontradas.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Quem é o cliente nessa conversa?</label>
              <Select value={customerSender} onValueChange={(v) => v && setCustomerSender(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                As demais mensagens (de {senders.filter((s) => s !== customerSender).join(', ') || 'outro remetente'}) entram como respostas suas.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {parsed && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={importing}>
              Escolher outro arquivo
            </Button>
          )}
          <Button size="sm" onClick={handleImport} disabled={!parsed || !customerSender || importing}>
            {importing ? 'Importando...' : `Importar${parsed ? ` ${parsed.length} mensagens` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
