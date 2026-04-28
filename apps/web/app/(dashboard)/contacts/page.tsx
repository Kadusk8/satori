'use client'

import { useState } from 'react'
import {
  Search,
  Filter,
  UserPlus,
  MessageSquare,
  Phone,
  ChevronDown,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Mock — substituir por query Supabase
const MOCK_CONTACTS = [
  {
    id: 'co1',
    name: 'João Silva',
    phone: '+55 62 9 9999-0001',
    whatsappName: 'João',
    tags: ['lead', 'interessado'],
    totalConversations: 3,
    lastContactAt: new Date(Date.now() - 2 * 60000).toISOString(),
    status: 'active',
  },
  {
    id: 'co2',
    name: 'Maria Santos',
    phone: '+55 62 9 9999-0002',
    whatsappName: 'Maria Santos',
    tags: ['cliente'],
    totalConversations: 7,
    lastContactAt: new Date(Date.now() - 5 * 60000).toISOString(),
    status: 'active',
  },
  {
    id: 'co3',
    name: 'Carlos Oliveira',
    phone: '+55 62 9 9999-0003',
    whatsappName: 'Carlos',
    tags: ['vip', 'agendado'],
    totalConversations: 12,
    lastContactAt: new Date(Date.now() - 30 * 60000).toISOString(),
    status: 'active',
  },
  {
    id: 'co4',
    name: 'Ana Costa',
    phone: '+55 62 9 9999-0004',
    whatsappName: 'Ana Costa',
    tags: [],
    totalConversations: 1,
    lastContactAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'active',
  },
  {
    id: 'co5',
    name: 'Pedro Ferreira',
    phone: '+55 62 9 9999-0005',
    whatsappName: 'Pedro',
    tags: ['lead'],
    totalConversations: 2,
    lastContactAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'active',
  },
  {
    id: 'co6',
    name: 'Lucia Mendes',
    phone: '+55 62 9 9999-0006',
    whatsappName: 'Lucia',
    tags: ['cliente', 'fidelizado'],
    totalConversations: 20,
    lastContactAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'active',
  },
]

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

const TAG_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-600',
  cliente: 'bg-green-500/10 text-green-600',
  vip: 'bg-purple-500/10 text-purple-600',
  agendado: 'bg-teal-500/10 text-teal-600',
  interessado: 'bg-orange-500/10 text-orange-600',
  fidelizado: 'bg-yellow-500/10 text-yellow-600',
}

export default function ContactsPage() {
  const [search, setSearch] = useState('')

  const filtered = MOCK_CONTACTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  )

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {MOCK_CONTACTS.length} leads e clientes
          </p>
        </div>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo contato
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filtrar
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button variant="outline" className="gap-2">
          <Tag className="h-4 w-4" />
          Etiquetas
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Contato</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Telefone</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Etiquetas</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Conversas</th>
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
                        {contact.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      {contact.whatsappName !== contact.name && (
                        <p className="text-xs text-muted-foreground">
                          WA: {contact.whatsappName}
                        </p>
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
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            TAG_COLORS[tag] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="text-xs">
                    {contact.totalConversations}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatLastContact(contact.lastContactAt)}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/conversations?contact=${contact.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Conversar
                  </a>
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
    </div>
  )
}
