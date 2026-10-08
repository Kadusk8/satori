'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  MessageSquare,
  Phone,
  ChevronDown,
  Tag,
  StickyNote,
  Pencil,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn, formatBRL } from '@/lib/utils'
import { CLIENT_STATUS_LABEL, type ClientStatus } from '@/lib/client-score'
import { updateContactName, updateContactNotes, updateContactTags } from '@/lib/actions/contacts'

export interface Contact {
  id: string
  name: string
  phone: string
  whatsappName: string | null
  customName: string | null
  tags: string[]
  notes: string | null
  totalConversations: number
  lastContactAt: string
  visits: number
  totalSpent: number
  lastVisit: string | null
  score: number
  tier: string | null
  status: ClientStatus
}

const STATUS_CLASS: Record<ClientStatus, string> = {
  novo: 'bg-muted text-muted-foreground',
  ativo: 'bg-green-500/10 text-green-600',
  inativo: 'bg-orange-500/10 text-orange-600',
}

function formatVisitDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')
}

const TAG_PALETTE = [
  'bg-blue-500/10 text-blue-600',
  'bg-green-500/10 text-green-600',
  'bg-purple-500/10 text-purple-600',
  'bg-teal-500/10 text-teal-600',
  'bg-orange-500/10 text-orange-600',
  'bg-pink-500/10 text-pink-600',
]

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

function formatLastContact(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days === 1) return 'ontem'
  return `${days} dias atrás`
}

export function ContactsTable({ initialContacts, tiers }: { initialContacts: Contact[]; tiers: string[] }) {
  const router = useRouter()
  const [contactList, setContactList] = useState(initialContacts)
  const [search, setSearch] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('')
  const [tierFilter, setTierFilter] = useState('')
  const [editing, setEditing] = useState<Contact | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    contactList.forEach((c) => c.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [contactList])

  const filtered = contactList.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
    const matchesTags = activeTags.length === 0 || activeTags.every((t) => c.tags.includes(t))
    const matchesStatus = !statusFilter || c.status === statusFilter
    const matchesTier = !tierFilter || c.tier === tierFilter
    return matchesSearch && matchesTags && matchesStatus && matchesTier
  })

  function toggleTagFilter(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function handleSaved(updated: Contact) {
    setContactList((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    router.refresh()
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" className="gap-2">
              <Tag className="h-4 w-4" />
              Etiquetas {activeTags.length > 0 && `(${activeTags.length})`}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {allTags.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma etiqueta ainda</div>
            ) : (
              allTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={activeTags.includes(tag)}
                  onCheckedChange={() => toggleTagFilter(tag)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ClientStatus | '')}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Todos os status</option>
          {(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => (
            <option key={s} value={s}>{CLIENT_STATUS_LABEL[s]}</option>
          ))}
        </select>
        {tiers.length > 0 && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Todas as faixas</option>
            {tiers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-background overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Contato</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Telefone</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Etiquetas</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Visitas</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Total gasto</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Última visita</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Score</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Último contato</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((contact) => (
              <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium flex items-center gap-1.5">
                        <Link href={`/contacts/${contact.id}`} className="hover:underline">
                          {contact.name}
                        </Link>
                        {contact.notes && (
                          <span title={contact.notes}>
                            <StickyNote className="h-3 w-3 text-amber-500" />
                          </span>
                        )}
                      </p>
                      {contact.whatsappName && contact.whatsappName !== contact.name && (
                        <p className="text-xs text-muted-foreground">WA: {contact.whatsappName}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {contact.phone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      contact.tags.map((tag) => (
                        <span
                          key={tag}
                          className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tagColor(tag))}
                        >
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="text-xs">
                    {contact.visits}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">
                  {contact.totalSpent > 0 ? formatBRL(contact.totalSpent) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {contact.lastVisit ? formatVisitDate(contact.lastVisit) : '—'}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="font-semibold tabular-nums">{contact.score}</span>
                  {contact.tier && <span className="ml-1.5 text-muted-foreground">{contact.tier}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[contact.status])}>
                    {CLIENT_STATUS_LABEL[contact.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatLastContact(contact.lastContactAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(contact)}
                      title="Editar etiquetas e observação"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`/conversations?contact=${contact.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Conversar
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-sm">Nenhum contato encontrado.</p>
          </div>
        )}
      </div>

      <ContactEditDialog contact={editing} onOpenChange={(v) => !v && setEditing(null)} onSaved={handleSaved} />
    </>
  )
}

function ContactEditDialog({
  contact,
  onOpenChange,
  onSaved,
}: {
  contact: Contact | null
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Contact) => void
}) {
  const [name, setName] = useState(contact?.name ?? '')
  const [tags, setTags] = useState<string[]>(contact?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [saving, setSaving] = useState(false)

  function addTag(e: React.FormEvent) {
    e.preventDefault()
    const tag = tagInput.trim().toLowerCase()
    if (!tag || tags.includes(tag)) {
      setTagInput('')
      return
    }
    setTags((prev) => [...prev, tag])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  async function handleSave() {
    if (!contact) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('O nome não pode ficar em branco')
      return
    }
    setSaving(true)
    try {
      await Promise.all([
        updateContactName(contact.id, trimmedName),
        updateContactTags(contact.id, tags),
        updateContactNotes(contact.id, notes),
      ])
      onSaved({ ...contact, name: trimmedName, customName: trimmedName, tags, notes: notes.trim() || null })
      toast.success('Contato atualizado')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      key={contact?.id ?? 'none'}
      open={!!contact}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do contato"
              className="h-9 text-sm"
            />
            {contact?.whatsappName && contact.whatsappName !== name && (
              <p className="text-xs text-muted-foreground">Nome no WhatsApp: {contact.whatsappName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Etiquetas</label>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button key={tag} type="button" onClick={() => removeTag(tag)} className="group">
                  <Badge variant="secondary" className="text-xs gap-1 group-hover:bg-destructive/10 group-hover:text-destructive transition-colors">
                    {tag}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                </button>
              ))}
            </div>
            <form onSubmit={addTag} className="flex gap-1.5">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Nova etiqueta..."
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!tagInput.trim()}>
                Adicionar
              </Button>
            </form>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              Observação
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes sobre esse lead..."
              className="min-h-24 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
