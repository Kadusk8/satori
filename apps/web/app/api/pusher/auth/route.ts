import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withClaims, type DbClaims } from '@/lib/db'
import { conversations } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { getPusherServerClient, tenantChannel } from '@/lib/realtime/server'

// Autoriza subscription em canais privados. Duas famílias de canal:
// - private-tenant-{tenantId}: precisa bater com o tenant da sessão.
// - private-conversation-{id}: precisa que a conversa pertença ao tenant da
//   sessão — a checagem roda dentro de withClaims, então a própria RLS já
//   garante isolamento (0 linhas se for de outro tenant).
export async function POST(request: NextRequest) {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const pusher = getPusherServerClient()
  if (!pusher) {
    return NextResponse.json({ error: 'Realtime não configurado' }, { status: 503 })
  }

  const form = await request.formData()
  const socketId = form.get('socket_id')?.toString()
  const channelName = form.get('channel_name')?.toString()
  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'socket_id e channel_name são obrigatórios' }, { status: 400 })
  }

  const authorized =
    channelName === tenantChannel(claims.tenant_id) ||
    (channelName.startsWith('private-conversation-') && (await conversationBelongsToTenant(channelName, claims)))

  if (!authorized) {
    return NextResponse.json({ error: 'Canal não autorizado' }, { status: 403 })
  }

  const authResponse = pusher.authorizeChannel(socketId, channelName)
  return NextResponse.json(authResponse)
}

async function conversationBelongsToTenant(channelName: string, claims: DbClaims): Promise<boolean> {
  const conversationId = channelName.slice('private-conversation-'.length)
  const rows = await withClaims(claims, (tx) =>
    tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, conversationId)).limit(1)
  )
  return rows.length > 0
}
