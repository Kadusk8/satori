// Wrapper de baixo nível pra Evolution Go — portado de
// supabase/functions/_shared/evolution-client.ts (era Deno, aqui é Node/Next).
// Usado no onboarding (validar conexão + registrar webhook) e reaproveitável
// pelo serviço backend da Fase 5.

export async function checkEvolutionConnection(params: {
  url: string
  apiKey: string
}): Promise<{ state: string; connected: boolean }> {
  try {
    const base = params.url.replace(/\/$/, '')
    const res = await fetch(`${base}/instance/status`, {
      headers: { apikey: params.apiKey },
    })
    if (!res.ok) return { state: 'not_found', connected: false }
    const body = await res.json()
    const d = body?.data ?? {}
    // A Evolution Go devolve os campos em PascalCase (Connected/LoggedIn),
    // não camelCase — checar os dois formatos por segurança.
    const isConnected = d.connected === true || d.Connected === true
    const isLoggedIn = d.loggedIn === true || d.LoggedIn === true
    const connected = isConnected && isLoggedIn
    const state = isConnected && isLoggedIn ? 'open' : isConnected ? 'connecting' : 'close'
    return { state, connected }
  } catch {
    return { state: 'error', connected: false }
  }
}

export async function setEvolutionWebhook(params: {
  url: string
  apiKey: string
  webhookUrl: string
}): Promise<void> {
  const base = params.url.replace(/\/$/, '')
  const res = await fetch(`${base}/instance/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: params.apiKey },
    body: JSON.stringify({ webhookUrl: params.webhookUrl, subscribe: ['MESSAGE', 'CONNECTION', 'LABEL', 'CONTACT'] }),
  })
  if (!res.ok) throw new Error(`Evolution Go instance/connect: ${await res.text()}`)
}
