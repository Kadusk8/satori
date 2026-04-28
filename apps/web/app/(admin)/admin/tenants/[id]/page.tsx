import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Building2, MessageSquare, Bot, Clock } from 'lucide-react'
import { TenantActions } from './tenant-actions'
import { AgentEditor } from './agent-editor'
import { LlmEditor } from './llm-editor'
import { AudioEditor } from './audio-editor'

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  onboarding: 'secondary',
  suspended: 'destructive',
  cancelled: 'destructive',
}

const statusLabel: Record<string, string> = {
  active: 'Ativo',
  onboarding: 'Onboarding',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
}

const planVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  enterprise: 'default',
}

const segmentLabel: Record<string, string> = {
  clinica: 'Clínica / Saúde',
  loja: 'Loja',
  restaurante: 'Restaurante',
  servicos: 'Serviços',
  outro: 'Outro',
}

interface TenantPageProps {
  params: Promise<{ id: string }>
}

export default async function TenantDetailPage({ params }: TenantPageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single()

  if (!tenant) notFound()

  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, name, system_prompt, greeting_message, out_of_hours_message, personality, is_active, model, voice_id, audio_response_enabled')
    .eq('tenant_id', id)
    .eq('slug', 'sdr')
    .maybeSingle()

  const businessHours = tenant.business_hours as Record<string, { enabled?: boolean; start?: string; end?: string }> | null

  const DAY_LABELS: Record<string, string> = {
    mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
  }

  const activeDays = businessHours
    ? Object.entries(businessHours)
        .filter(([, v]) => v.enabled !== false)
        .map(([k, v]) => `${DAY_LABELS[k] ?? k} ${v.start ?? ''}–${v.end ?? ''}`)
        .join(', ')
    : '—'

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" render={<Link href="/admin/tenants" />} nativeButton={false}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Empresas
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
            <Badge variant={statusVariant[tenant.status]}>{statusLabel[tenant.status]}</Badge>
            <Badge variant={planVariant[tenant.plan]}>{tenant.plan}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Criado em {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
            {tenant.onboarding_completed_at && (
              <> · Ativado em {new Date(tenant.onboarding_completed_at).toLocaleDateString('pt-BR')}</>
            )}
          </p>
        </div>
        <TenantActions tenant={{
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          business_segment: tenant.business_segment,
          business_description: tenant.business_description,
          owner_name: tenant.owner_name,
          owner_email: tenant.owner_email,
          owner_phone: tenant.owner_phone,
          city: tenant.city,
          state: tenant.state,
          website: tenant.website,
          plan: tenant.plan,
        }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Informações do negócio */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Negócio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Segmento" value={segmentLabel[tenant.business_segment ?? ''] ?? tenant.business_segment ?? '—'} />
            <DetailRow label="Descrição" value={tenant.business_description ?? '—'} />
            <DetailRow label="Responsável" value={tenant.owner_name ?? '—'} />
            <DetailRow label="Email" value={tenant.owner_email ?? '—'} />
            <DetailRow label="Telefone" value={tenant.owner_phone ?? '—'} />
            {tenant.city && (
              <DetailRow label="Cidade" value={`${tenant.city}${tenant.state ? `/${tenant.state}` : ''}`} />
            )}
            {tenant.website && <DetailRow label="Website" value={tenant.website} />}
          </CardContent>
        </Card>

        {/* WhatsApp / Evolution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Número" value={tenant.whatsapp_number ?? '—'} />
            <DetailRow
              label="Conexão"
              value={tenant.whatsapp_connection_type === 'cloud_api' ? 'WhatsApp Cloud API' : 'Baileys (QR Code)'}
            />
            <DetailRow
              label="Status"
              value={tenant.whatsapp_connected ? 'Conectado' : 'Desconectado'}
              valueClass={tenant.whatsapp_connected ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
            />
            <DetailRow label="Evolution URL" value={tenant.evolution_api_url ?? '—'} />
            <DetailRow label="Instância" value={tenant.evolution_instance_name ?? '—'} />
          </CardContent>
        </Card>

        {/* Uso */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              Uso do plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">Mensagens</span>
                <span className="font-medium">
                  {(tenant.messages_used_month ?? 0).toLocaleString('pt-BR')} / {(tenant.max_messages_month ?? 1000).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(((tenant.messages_used_month ?? 0) / (tenant.max_messages_month ?? 1000)) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
            <DetailRow label="Máx. produtos" value={String(tenant.max_products ?? 50)} />
            <DetailRow label="Máx. operadores" value={String(tenant.max_operators ?? 3)} />
          </CardContent>
        </Card>

        {/* Provedor de IA */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Provedor de IA
              </CardTitle>
              {agent && (
                <LlmEditor
                  agentId={agent.id}
                  tenantId={id}
                  currentModel={agent.model ?? 'gpt-4o'}
                  hasOpenaiKey={!!tenant.openai_api_key}
                  hasGeminiKey={!!tenant.gemini_api_key}
                  hasAnthropicKey={!!tenant.anthropic_api_key}
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Modelo atual" value={agent?.model ?? '—'} />
            <DetailRow
              label="OpenAI key"
              value={tenant.openai_api_key ? '✓ configurada' : 'não configurada'}
              valueClass={tenant.openai_api_key ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
            />
            <DetailRow
              label="Gemini key"
              value={tenant.gemini_api_key ? '✓ configurada' : 'não configurada'}
              valueClass={tenant.gemini_api_key ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
            />
            <DetailRow
              label="Anthropic key"
              value={tenant.anthropic_api_key ? '✓ configurada' : 'não configurada'}
              valueClass={tenant.anthropic_api_key ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
            />
            <DetailRow
              label="ElevenLabs key"
              value={tenant.elevenlabs_api_key ? '✓ configurada' : 'não configurada'}
              valueClass={tenant.elevenlabs_api_key ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
            />
            {agent && (
              <div className="pt-1">
                <AudioEditor
                  agentId={agent.id}
                  tenantId={id}
                  currentVoiceId={agent.voice_id ?? null}
                  audioResponseEnabled={agent.audio_response_enabled ?? false}
                  hasElevenLabsKey={!!tenant.elevenlabs_api_key}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agente de IA */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Agente de IA (SDR)
              </CardTitle>
              {agent && (
                <AgentEditor agent={agent} tenantId={id} />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {agent ? (
              <>
                <DetailRow label="Nome" value={agent.name} />
                <DetailRow label="Personalidade" value={agent.personality ?? '—'} />
                <DetailRow label="Status" value={agent.is_active ? 'Ativo' : 'Inativo'} valueClass={agent.is_active ? 'text-emerald-600 font-medium' : 'text-muted-foreground'} />
                <DetailRow
                  label="Áudio (TTS)"
                  value={agent.audio_response_enabled ? `Ativo — ${agent.voice_id ?? 'sem voz'}` : 'Desativado'}
                  valueClass={agent.audio_response_enabled ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}
                />
                <DetailRow label="Boas-vindas" value={agent.greeting_message ?? '—'} />
                <DetailRow label="Fora do horário" value={agent.out_of_hours_message ?? '—'} />
                <div className="mt-2">
                  <span className="text-muted-foreground text-xs block mb-1">Prompt do sistema</span>
                  <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                    {agent.system_prompt}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Agente ainda não foi criado para este tenant.</p>
            )}
          </CardContent>
        </Card>

        {/* Horários */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Horários
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Dias ativos" value={activeDays} />
            <DetailRow label="Fuso horário" value={tenant.timezone ?? 'America/Sao_Paulo'} />
            <DetailRow label="Duração agendamento" value={`${tenant.appointment_duration_minutes ?? 30} min`} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={valueClass ?? 'font-medium break-all'}>{value}</span>
    </div>
  )
}
