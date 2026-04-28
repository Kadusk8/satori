import { createAdminClient } from '../_shared/supabase-admin.ts'
import { getEvolutionClient } from '../_shared/evolution-client.ts'

export interface SendWhatsAppPayload {
  tenantId: string               // obrigatório — determina URL, apiKey e instanceName
  to: string                     // número no formato 5562999999999
  type: 'text' | 'image'
  text?: string
  imageUrl?: string
  caption?: string
  // Para salvar no banco após envio
  conversationId?: string
}

Deno.serve(async (req: Request) => {
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

  let payload: SendWhatsAppPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { tenantId, to, type, text, imageUrl, caption, conversationId } = payload

  if (!tenantId || !to) {
    return Response.json(
      { error: 'tenantId e to são obrigatórios' },
      { status: 400 }
    )
  }

  try {
    // Busca credenciais do tenant e cria cliente Evolution configurado
    const evo = await getEvolutionClient(tenantId)

    let whatsappMessageId: string | null = null

    if (type === 'text') {
      if (!text) return Response.json({ error: 'text obrigatório para type=text' }, { status: 400 })
      whatsappMessageId = await evo.sendText(to, text)
    } else if (type === 'image') {
      if (!imageUrl) return Response.json({ error: 'imageUrl obrigatório para type=image' }, { status: 400 })
      whatsappMessageId = await evo.sendMedia(to, imageUrl, caption)
    } else {
      return Response.json({ error: 'type deve ser text ou image' }, { status: 400 })
    }

    // Salva a mensagem enviada no banco se conversationId foi fornecido
    if (conversationId) {
      const supabase = createAdminClient()

      // Busca contact_id da conversa
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .single()

      if (conv) {
        await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: conv.contact_id,
          sender_type: 'ai',
          content: type === 'text' ? text : caption ?? null,
          content_type: type === 'text' ? 'text' : 'image',
          media_url: type === 'image' ? imageUrl : null,
          whatsapp_message_id: whatsappMessageId,
        })

        // Atualiza last_message_at da conversa
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      }
    }

    return Response.json(
      { success: true, whatsappMessageId },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[send-whatsapp]', message)
    return Response.json(
      { error: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
