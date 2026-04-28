import { createAdminClient } from '../_shared/supabase-admin.ts'
import {
  createEvolutionInstance,
  setEvolutionWebhook,
  checkEvolutionConnection,
} from '../_shared/evolution-client.ts'
import type { OnboardingPayload } from '../_shared/types.ts'

// Slugifica o nome da empresa para uso como tenant.slug e instanceName
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}


// Estágios padrão do kanban criados para todo novo tenant
const DEFAULT_KANBAN_STAGES = [
  { name: 'Novo Lead',         slug: 'novo_lead',        color: '#6366f1', position: 0, is_default: true },
  { name: 'IA Atendendo',      slug: 'ia_atendendo',     color: '#8b5cf6', position: 1 },
  { name: 'Aguardando Humano', slug: 'aguardando_humano', color: '#f59e0b', position: 2 },
  { name: 'Em Atendimento',    slug: 'em_atendimento',   color: '#3b82f6', position: 3 },
  { name: 'Agendado',          slug: 'agendado',         color: '#10b981', position: 4 },
  { name: 'Finalizado',        slug: 'finalizado',       color: '#6b7280', position: 5, is_closed: true },
]

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  let payload: OnboardingPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { step1, step2, step3, step4, step5, currentStepId } = payload

  // Validação mínima
  if (!step1?.name || !step1?.ownerEmail || !step2?.whatsappNumber) {
    return Response.json(
      { error: 'Dados obrigatórios ausentes (name, ownerEmail, whatsappNumber)' },
      { status: 400 }
    )
  }

  // Validação dos campos novos do step2
  if (!step2.evolutionApiUrl || !step2.evolutionApiKey || !step2.instanceName) {
    return Response.json(
      { error: 'Dados Evolution API obrigatórios (evolutionApiUrl, evolutionApiKey, instanceName)' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const slug = slugify(step1.name)
  const instanceName = step2.instanceName.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  try {
    // ── Etapa: tenant ──────────────────────────────────────────────
    if (!currentStepId || currentStepId === 'tenant') {
      // Verifica se tenant com esse slug já existe (tentativa anterior falhou no meio)
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      let tenantId: string

      if (existing) {
        // Reutiliza o tenant já criado e atualiza os dados
        tenantId = existing.id
        await supabase.from('tenants').update({
          name: step1.name,
          business_segment: step1.segment,
          business_description: step1.description,
          owner_name: step1.ownerName,
          owner_email: step1.ownerEmail,
          owner_phone: step1.ownerPhone,
          address: step1.address,
          city: step1.city,
          state: step1.state,
          website: step1.website,
          evolution_api_url: step2.evolutionApiUrl.trim().replace(/\/$/, ''),
          evolution_api_key: step2.evolutionApiKey,
          evolution_instance_name: instanceName,
          whatsapp_number: step2.whatsappNumber,
          whatsapp_connection_type: step2.connectionType,
          business_hours: step5.businessHours,
          timezone: step5.timezone,
          appointment_duration_minutes: step5.appointmentDurationMinutes,
          openai_api_key: step3.llmProvider === 'openai' ? step3.llmApiKey : null,
          gemini_api_key: step3.llmProvider === 'gemini' ? step3.llmApiKey : null,
          anthropic_api_key: step3.llmProvider === 'anthropic' ? step3.llmApiKey : null,
        }).eq('id', tenantId)
      } else {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .insert({
            name: step1.name,
            slug,
            business_segment: step1.segment,
            business_description: step1.description,
            owner_name: step1.ownerName,
            owner_email: step1.ownerEmail,
            owner_phone: step1.ownerPhone,
            address: step1.address,
            city: step1.city,
            state: step1.state,
            website: step1.website,
            evolution_api_url: step2.evolutionApiUrl.trim().replace(/\/$/, ''),
            evolution_api_key: step2.evolutionApiKey,
            evolution_instance_name: instanceName,
            whatsapp_number: step2.whatsappNumber,
            whatsapp_connection_type: step2.connectionType,
            business_hours: step5.businessHours,
            timezone: step5.timezone,
            appointment_duration_minutes: step5.appointmentDurationMinutes,
            openai_api_key: step3.llmProvider === 'openai' ? step3.llmApiKey : null,
            gemini_api_key: step3.llmProvider === 'gemini' ? step3.llmApiKey : null,
            anthropic_api_key: null,
            status: 'onboarding',
            plan: 'starter',
          })
          .select('id')
          .single()

        if (tenantError) throw new Error(`Tenant: ${tenantError.message}`)
        tenantId = tenant.id
      }

      // ── Etapa: user (owner) ────────────────────────────────────
      if (!currentStepId || currentStepId === 'user') {
        // Verifica se usuário já existe no auth
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existingAuthUser = existingUsers?.users?.find((u: { id: string; email?: string }) => u.email === step1.ownerEmail)

        let authUserId: string
        if (existingAuthUser) {
          authUserId = existingAuthUser.id
          // Sempre atualiza metadata (tenant_id pode ter mudado se tenant foi recriado)
          const updatePayload: Record<string, unknown> = {
            user_metadata: { full_name: step1.ownerName, tenant_id: tenantId, role: 'owner' },
          }
          if (step1.ownerPassword) updatePayload.password = step1.ownerPassword
          await supabase.auth.admin.updateUserById(authUserId, updatePayload)
        } else {
          // Cria usuário com senha definida no onboarding (acesso imediato, sem esperar email)
          const { data: createData, error: authError } =
            await supabase.auth.admin.createUser({
              email: step1.ownerEmail,
              password: step1.ownerPassword,
              email_confirm: true,
              user_metadata: {
                full_name: step1.ownerName,
                tenant_id: tenantId,
                role: 'owner',
              },
            })
          if (authError) throw new Error(`Auth user: ${authError.message}`)
          authUserId = createData.user.id
        }

        // Upsert na tabela users para evitar duplicata
        const { error: userError } = await supabase.from('users').upsert({
          id: authUserId,
          tenant_id: tenantId,
          full_name: step1.ownerName,
          email: step1.ownerEmail,
          role: 'owner',
        }, { onConflict: 'id' })

        if (userError) throw new Error(`Users table: ${userError.message}`)
      }

      // ── Etapa: kanban ──────────────────────────────────────────
      if (!currentStepId || currentStepId === 'kanban') {
        const stages = DEFAULT_KANBAN_STAGES.map((s) => ({
          ...s,
          tenant_id: tenantId,
          is_default: s.is_default ?? false,
          is_closed: s.is_closed ?? false,
        }))

        // Upsert para não falhar se stages já foram criados numa tentativa anterior
        const { error: kanbanError } = await supabase
          .from('kanban_stages')
          .upsert(stages, { onConflict: 'tenant_id,slug' })

        if (kanbanError) throw new Error(`Kanban: ${kanbanError.message}`)
      }

      // ── Etapa: evolution (criar/validar instância) ─────────────
      if (!currentStepId || currentStepId === 'evolution') {
        const evoParams = {
          url: step2.evolutionApiUrl,
          apiKey: step2.evolutionApiKey,
          instanceName,
        }

        // Verifica se a instância já existe antes de criar
        const { state } = await checkEvolutionConnection(evoParams)

        if (state === 'open' || state === 'connecting' || state === 'qr') {
          // Instância já existe e está em uso — não recriar
          console.log(`[onboard-tenant] Instância ${instanceName} já existe (state: ${state}), pulando criação`)
        } else {
          // Tentar criar — se já existir (403/nome em uso), ignorar e seguir
          console.log(`[onboard-tenant] Criando instância Evolution: ${instanceName} (state atual: ${state})`)
          try {
            await createEvolutionInstance({
              ...evoParams,
              connectionType: step2.connectionType,
              cloudApiToken: step2.cloudApiToken,
              cloudApiBusinessId: step2.cloudApiBusinessId,
            })
          } catch (evoErr) {
            const errMsg = evoErr instanceof Error ? evoErr.message : String(evoErr)
            // "already in use" ou status 403 = instância já existe, pode continuar
            if (errMsg.includes('already in use') || errMsg.includes('403')) {
              console.log(`[onboard-tenant] Instância ${instanceName} já existia (ignorando erro de duplicata)`)
            } else {
              throw evoErr
            }
          }
        }
      }

      // ── Etapa: webhook ─────────────────────────────────────────
      if (!currentStepId || currentStepId === 'webhook') {
        const webhookUrl = `${supabaseUrl}/functions/v1/webhook-evolution`
        await setEvolutionWebhook({
          url: step2.evolutionApiUrl,
          apiKey: step2.evolutionApiKey,
          instanceName,
          webhookUrl,
        })
      }

      // ── Etapa: agent (SDR) ─────────────────────────────────────
      if (!currentStepId || currentStepId === 'agent') {
        // Cadastra produtos do step4 primeiro (se não pulou) para gerar resumo
        let productSummary: string | undefined
        if (!step4.skipped && step4.products.length > 0) {
          const products = step4.products.map((p) => ({
            tenant_id: tenantId,
            name: p.name,
            description: p.description,
            price: p.price
              ? parseFloat(p.price.replace(/[^0-9,]/g, '').replace(',', '.')) || null
              : null,
            price_display: p.price || null,
            category: p.category || null,
            is_available: true,
          }))

          const { error: productsError } = await supabase
            .from('products')
            .insert(products)

          if (productsError) {
            console.error('Produtos (não crítico):', productsError.message)
          } else {
            productSummary = step4.products
              .map((p) => `- ${p.name}${p.price ? ` — ${p.price}` : ''}${p.description ? `: ${p.description}` : ''}`)
              .join('\n')
          }
        }

        // Delega criação do agente SDR para setup-ai-agent
        const agentRes = await fetch(
          `${supabaseUrl}/functions/v1/setup-ai-agent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
            },
            body: JSON.stringify({
              tenantId,
              step1,
              step3,
              step5,
              productSummary,
            }),
          }
        )

        if (!agentRes.ok) {
          const err = await agentRes.text()
          throw new Error(`setup-ai-agent: ${err}`)
        }
      }

      // ── Etapa: email ───────────────────────────────────────────
      if (!currentStepId || currentStepId === 'email') {
        await supabase.from('onboarding_logs').insert({
          tenant_id: tenantId,
          created_by: (await supabase.auth.getUser()).data.user?.id ?? '',
          step: 'activated',
          step_data: {
            activatedAt: new Date().toISOString(),
            evolutionInstance: instanceName,
            evolutionUrl: step2.evolutionApiUrl,
          },
        })
      }

      // ── Ativa o tenant ─────────────────────────────────────────
      await supabase
        .from('tenants')
        .update({
          status: 'active',
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', tenantId)

      return Response.json(
        { success: true, tenantId, slug },
        {
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      )
    }

    // currentStepId não reconhecido
    return Response.json({ success: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    const stack = err instanceof Error ? err.stack : ''
    console.error('[onboard-tenant] ERROR:', message)
    console.error('[onboard-tenant] STACK:', stack)
    console.error('[onboard-tenant] PAYLOAD:', JSON.stringify({ step1, step2, step3, step4, step5, currentStepId }, null, 2))
    return Response.json(
      { error: message, detail: stack },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    )
  }
})
