export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageSquare, Phone } from 'lucide-react'
import { getDbClaims } from '@/lib/auth/session'
import { getClientDetail } from '@/lib/data/client-history'
import { CLIENT_STATUS_LABEL } from '@/lib/client-score'
import { STATUS_CONFIG } from '@/components/appointments/appointment-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatBRL } from '@/lib/utils'
import { ContactProfileForm } from './contact-profile-form'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDay(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const claims = await getDbClaims()
  if (!claims?.tenant_id || !UUID_RE.test(id)) notFound()

  const detail = await getClientDetail(claims, id)
  if (!detail) notFound()

  const { contact, summary, history } = detail

  const stats = [
    { label: 'Visitas', value: String(summary.visits) },
    { label: 'Total gasto', value: formatBRL(summary.totalSpent) },
    { label: 'Ticket médio', value: summary.visits > 0 ? formatBRL(summary.averageTicket) : '—' },
    { label: 'Última visita', value: summary.lastVisit ? formatDay(summary.lastVisit) : '—' },
    { label: 'Faltas', value: String(summary.noShows) },
    {
      label: 'Score',
      value: String(summary.score),
      hint: summary.tier?.name,
    },
  ]

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <Link
          href="/contacts"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Contatos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              summary.status === 'ativo' && 'bg-green-500/10 text-green-600',
              summary.status === 'inativo' && 'bg-orange-500/10 text-orange-600',
              summary.status === 'novo' && 'bg-muted text-muted-foreground'
            )}
          >
            {CLIENT_STATUS_LABEL[summary.status]}
          </span>
          {summary.tier && (
            <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
              {summary.tier.name}
            </span>
          )}
          <Link
            href={`/conversations?contact=${contact.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Conversar
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          {contact.whatsappNumber}
          {summary.firstVisit && <> · cliente desde {formatDay(summary.firstVisit)}</>}
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">{s.value}</p>
              {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {(detail.topService || detail.topProfessional) && (
        <p className="text-sm text-muted-foreground">
          {detail.topService && <>Serviço mais feito: <span className="text-foreground font-medium">{detail.topService}</span></>}
          {detail.topService && detail.topProfessional && ' · '}
          {detail.topProfessional && <>Atendido mais vezes por: <span className="text-foreground font-medium">{detail.topProfessional}</span></>}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Histórico */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de atendimentos</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum atendimento registrado ainda.
              </p>
            ) : (
              <ol className="space-y-3">
                {history.map((h) => {
                  const cfg = STATUS_CONFIG[h.status as keyof typeof STATUS_CONFIG]
                  return (
                    <li key={h.appointmentId} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatDay(h.date)} · {h.startTime}
                        </span>
                        {cfg && (
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.class)}>
                            {cfg.label}
                          </span>
                        )}
                        {h.total > 0 && (
                          <span className="ml-auto text-sm font-semibold tabular-nums">{formatBRL(h.total)}</span>
                        )}
                      </div>
                      {h.services.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {h.services.map((s, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-medium">{s.name}</span>
                              <span className="text-muted-foreground">
                                {s.professionalName ? `com ${s.professionalName}` : 'profissional não informado'}
                              </span>
                              <span className="ml-auto tabular-nums text-muted-foreground">{formatBRL(s.price)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        h.title && <p className="mt-1 text-xs text-muted-foreground">{h.title}</p>
                      )}
                      {h.notes && <p className="mt-1.5 text-xs text-muted-foreground italic">{h.notes}</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Cadastro */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Cadastro</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactProfileForm
              contactId={contact.id}
              whatsappName={contact.whatsappName}
              initial={{
                name: contact.name,
                email: contact.email ?? '',
                phone: contact.phone ?? '',
                birthDate: contact.birthDate ?? '',
                document: contact.document ?? '',
                address: contact.address ?? '',
                notes: contact.notes ?? '',
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
