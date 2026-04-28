import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Autenticação | ZapAgent',
  description: 'Entre na sua conta ZapAgent',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="auth-layout">
      {children}
    </div>
  )
}
