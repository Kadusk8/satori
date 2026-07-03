import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return new Response('Missing SUPABASE_URL', { status: 500 })
  }

  const incomingUrl = new URL(req.url)
  const functionUrl = `${supabaseUrl}/functions/v1/webhook-evolution${incomingUrl.search}`

  try {
    const body = await req.text()
    
    // Pass headers
    const headers = new Headers(req.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.delete('content-length')

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body,
    })

    const responseText = await response.text()
    
    return new Response(responseText, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json'
      }
    })
  } catch (error) {
    console.error('Proxy Error:', error)
    return new Response('Proxy Error', { status: 500 })
  }
}
