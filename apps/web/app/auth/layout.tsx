import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recuperar senha | Satori',
  description: 'Recuperação de senha da conta Satori',
}

export default function AuthUtilityLayout({
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
