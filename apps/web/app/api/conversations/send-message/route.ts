import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verifica autenticação
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { conversationId, text } = body

  if (!conversationId || !text?.trim()) {
    return NextResponse.json({ error: 'conversationId e text são obrigatórios' }, { status: 400 })
  }

  // Busca perfil do usuário para obter tenant_id (isolamento por tenant)
  const { data: userProfile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userProfile?.tenant_id) {
    return NextResponse.json({ error: 'Usuário sem tenant associado' }, { status: 403 })
  }

  // Busca dados necessários para enviar a mensagem
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select(`
      id, status, tenant_id, contact_id,
      contacts ( whatsapp_number )
    `)
    .eq('id', conversationId)
    .eq('tenant_id', userProfile.tenant_id)
    .single()

  if (convError || !conv) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  if (conv.status === 'closed') {
    return NextResponse.json({ error: 'Conversa encerrada' }, { status: 400 })
  }

  const contact = conv.contacts as unknown as { whatsapp_number: string }

  // Salva mensagem no banco como 'human'
  const { error: msgError } = await supabase.from('messages').insert({
    tenant_id: conv.tenant_id,
    conversation_id: conversationId,
    contact_id: conv.contact_id,
    sender_type: 'human',
    sender_id: user.id,
    content: text.trim(),
    content_type: 'text',
  })

  if (msgError) {
    return NextResponse.json({ error: 'Erro ao salvar mensagem' }, { status: 500 })
  }

  // Atualiza last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // Chama send-whatsapp via service role (a edge function envia para o WhatsApp)
  // Passa tenantId para que a edge function busque as credenciais da Evolution API
  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenantId: conv.tenant_id,
      to: contact.whatsapp_number,
      type: 'text',
      text: text.trim(),
      // Não passa conversationId para não salvar novamente (já salvamos acima)
    }),
  })

  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}))
    console.error('[send-message API] Falha ao enviar WhatsApp:', err)
    // Não retorna erro — mensagem já foi salva no banco
    // O operador pode ver que foi salva mas pode não ter chegado
  }

  return NextResponse.json({ success: true })
}
