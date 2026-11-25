import { NextResponse } from 'next/server'
import { and, eq, or, ne } from 'drizzle-orm'
import { withAdmin, withClaims } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

// Só serviços de push dos navegadores: o backend faz POST nesse endpoint, então aceitar qualquer host seria SSRF cego.
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]
function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    const claims = await getDbClaims()
    if (!claims || !claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint, keys } = body

    const isKey = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 256
    if (!isAllowedPushEndpoint(endpoint) || String(endpoint).length > 2048 || !isKey(keys?.p256dh) || !isKey(keys?.auth)) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
    }

    const userAgent = (request.headers.get('user-agent') || '').slice(0, 500)
    const userId = claims.sub
    const tenantId = claims.tenant_id

    // Mesmo navegador já inscrito por OUTRO usuário (aparelho compartilhado, logout
    // que não conseguiu cancelar): a policy RLS bloqueia o UPDATE do upsert numa linha
    // alheia, e a rota dava 500. Ter o endpoint prova posse do navegador (URL longa e
    // não adivinhável, emitida pelo serviço de push pra este navegador), então a linha
    // antiga é apagada — e o usuário anterior deixa de receber pushes neste aparelho.
    await withAdmin(async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            or(ne(pushSubscriptions.userId, userId), ne(pushSubscriptions.tenantId, tenantId))
          )
        )
    })

    await withClaims(claims, async (tx) => {
      await tx
        .insert(pushSubscriptions)
        .values({
          tenantId: claims.tenant_id!,
          userId: claims.sub!,
          endpoint,
          keysP256dh: keys.p256dh,
          keysAuth: keys.auth,
          userAgent,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            tenantId: claims.tenant_id!,
            userId: claims.sub!,
            keysP256dh: keys.p256dh,
            keysAuth: keys.auth,
            userAgent,
            createdAt: new Date(),
          },
        })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push-subscribe]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
