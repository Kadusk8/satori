import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Autenticação | Satori',
  description: 'Entre na sua conta Satori',
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
