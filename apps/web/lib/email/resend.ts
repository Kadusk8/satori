// Envio de email via Resend (REST, sem SDK) — substitui o SMTP embutido do
// Supabase que mandava os emails de reset de senha e convite.
// Requer RESEND_API_KEY e EMAIL_FROM no ambiente.

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY / EMAIL_FROM não configurados')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Resend falhou (${res.status}): ${detail}`)
  }
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://satori.ia.br'
}

/** Email de redefinição de senha (link com token). */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`
  await sendEmail({
    to,
    subject: 'Redefinição de senha — Satori',
    html: `
      <p>Você pediu para redefinir sua senha.</p>
      <p><a href="${link}">Clique aqui para escolher uma nova senha</a>. O link expira em 24 horas.</p>
      <p>Se não foi você, ignore este email.</p>
    `,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/**
 * Email de convite de operador (link com token pra definir a senha) + convite
 * pra instalar o app no celular — sem o app, o operador não recebe aviso de
 * cliente esperando atendimento.
 */
export async function sendOperatorInviteEmail(to: string, token: string, companyName: string): Promise<void> {
  const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}&invite=1`
  const installLink = `${appUrl()}/instalar`
  const company = escapeHtml(companyName)
  await sendEmail({
    to,
    subject: `Convite para a equipe — ${companyName}`,
    html: `
      <p>Você foi convidado para atender no painel da <strong>${company}</strong> no Satori.</p>
      <p><strong>1.</strong> <a href="${link}">Clique aqui para definir sua senha e acessar</a>. O link expira em 24 horas.</p>
      <p><strong>2.</strong> Instale o app no seu celular para ser avisado na hora quando um cliente precisar de você:
        <a href="${installLink}">${installLink.replace(/^https?:\/\//, '')}</a></p>
      <p style="color:#666;font-size:13px">No iPhone, abra o link no Safari. No Android, no Chrome.</p>
    `,
  })
}
