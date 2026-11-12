// Alertas operacionais por e-mail (Resend, REST sem SDK) pro dono da plataforma.
// Precisa de RESEND_API_KEY, EMAIL_FROM e ALERT_EMAILS (lista separada por vírgula) no ambiente.
// Sem isso, só loga — nunca derruba o fluxo que chamou.

import type { AlertKind } from './connection-watch.js'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildConnectionAlert(
  kind: AlertKind,
  tenantName: string,
  tenantId: string,
  detail?: string
): { subject: string; html: string } {
  const name = escapeHtml(tenantName.trim())
  const adminUrl = `${(process.env.APP_PUBLIC_URL ?? 'https://satori.ia.br').replace(/\/$/, '')}/admin/tenants/${tenantId}`
  const link = `<p><a href="${adminUrl}">Abrir a empresa no painel</a></p>`

  if (kind === 'logged_out') {
    return {
      subject: `⚠️ WhatsApp deslogado — ${tenantName.trim()}`,
      html: `<p>O WhatsApp da <strong>${name}</strong> foi <strong>deslogado</strong> (o aparelho foi removido no celular ou a sessão foi encerrada).</p>
<p>Isso não volta sozinho: é preciso <strong>escanear um QR novo</strong> na instância do Evolution Go. Enquanto isso, a IA não recebe nem responde mensagens dessa empresa.</p>${link}`,
    }
  }
  if (kind === 'not_recovered') {
    return {
      subject: `⚠️ WhatsApp fora do ar — ${tenantName.trim()}`,
      html: `<p>O WhatsApp da <strong>${name}</strong> caiu e <strong>não voltou</strong>, mesmo depois da tentativa automática de reconexão.</p>
${detail ? `<p>Detalhe: <code>${escapeHtml(detail)}</code></p>` : ''}
<p>Vale conferir a instância no Evolution Go e, se preciso, usar o botão "Reconectar" no painel. Enquanto isso, a IA não recebe nem responde mensagens dessa empresa.</p>${link}`,
    }
  }
  return {
    subject: `✅ WhatsApp voltou — ${tenantName.trim()}`,
    html: `<p>O WhatsApp da <strong>${name}</strong> está <strong>conectado de novo</strong>.</p>${link}`,
  }
}

export async function sendAlertEmail(subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const to = (process.env.ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!apiKey || !from || to.length === 0) {
    console.error('[alert-email] RESEND_API_KEY / EMAIL_FROM / ALERT_EMAILS não configurados — alerta não enviado:', subject)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    console.error(`[alert-email] Resend falhou (${res.status}):`, (await res.text()).slice(0, 300))
    return false
  }
  return true
}
