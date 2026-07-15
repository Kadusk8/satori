import { NextResponse } from 'next/server'
import { withClaims } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

export async function DELETE(request: Request) {
  try {
    const claims = await getDbClaims()
    if (!claims || !claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 })
    }

    await withClaims(claims, async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, claims.sub!),
            eq(pushSubscriptions.endpoint, endpoint)
          )
        )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push-unsubscribe]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
