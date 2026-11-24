import { NextResponse } from 'next/server'
import { withClaims } from '@/lib/db'
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

    if (!isAllowedPushEndpoint(endpoint) || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
    }

    const userAgent = request.headers.get('user-agent') || ''

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
