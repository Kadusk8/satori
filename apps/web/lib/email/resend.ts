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
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://app.zapagent.com'
}

/** Email de redefinição de senha (link com token). */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`
  await sendEmail({
    to,
    subject: 'Redefinição de senha — ZapAgent',
    html: `
      <p>Você pediu para redefinir sua senha.</p>
      <p><a href="${link}">Clique aqui para escolher uma nova senha</a>. O link expira em 24 horas.</p>
      <p>Se não foi você, ignore este email.</p>
    `,
  })
}

/** Email de convite de operador (link com token pra definir a senha). */
export async function sendOperatorInviteEmail(to: string, token: string, companyName: string): Promise<void> {
  const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}&invite=1`
  await sendEmail({
    to,
    subject: `Convite para a equipe — ${companyName}`,
    html: `
      <p>Você foi convidado para atender no painel da <strong>${companyName}</strong> no ZapAgent.</p>
      <p><a href="${link}">Clique aqui para definir sua senha e acessar</a>. O link expira em 24 horas.</p>
    `,
  })
}
