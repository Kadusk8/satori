'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPasswordWithToken } from '../actions'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirm_password') as string

    if (!token) {
      setError('Link inválido. Solicite uma nova redefinição de senha.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    startTransition(async () => {
      const result = await resetPasswordWithToken(token, password)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.push('/login')
    })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-layout {
          font-family: 'Inter', sans-serif;
          min-height: 100vh;
          background: #050508;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .auth-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }

        .auth-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.25;
        }

        .auth-bg-orb-1 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #8b5cf6, transparent);
          top: -150px;
          left: -100px;
          animation: float1 9s ease-in-out infinite;
        }

        .auth-bg-orb-2 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #6366f1, transparent);
          bottom: -200px;
          right: -100px;
          animation: float2 11s ease-in-out infinite;
        }

        .auth-bg-orb-3 {
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, #06b6d4, transparent);
          top: 30%;
          right: 20%;
          animation: float3 7s ease-in-out infinite;
        }

        .auth-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(25px, 25px) scale(1.05); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-20px, -20px) scale(1.03); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
          50% { transform: translate(-15px, 15px) scale(1.2); opacity: 0.15; }
        }

        .auth-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          padding: 24px;
        }

        .auth-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 32px;
        }

        .auth-logo-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
        }

        .auth-logo-text {
          font-size: 22px;
          font-weight: 700;
          background: linear-gradient(135deg, #fff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .auth-card {
          background: rgba(15, 15, 25, 0.8);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 20px;
          padding: 36px 32px;
          backdrop-filter: blur(20px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03),
            0 20px 60px rgba(0,0,0,0.5),
            0 0 80px rgba(99, 102, 241, 0.05);
        }

        .auth-card-title {
          font-size: 24px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 6px;
        }

        .auth-card-subtitle {
          font-size: 14px;
          color: rgba(255,255,255,0.45);
          margin-bottom: 28px;
        }

        .auth-error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #f87171;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .auth-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.02em;
        }

        .auth-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 14px;
          color: #fff;
          outline: none;
          transition: all 0.2s;
          font-family: inherit;
          width: 100%;
        }

        .auth-input::placeholder {
          color: rgba(255,255,255,0.2);
        }

        .auth-input:focus {
          border-color: rgba(99, 102, 241, 0.6);
          background: rgba(99, 102, 241, 0.05);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .auth-hint {
          font-size: 11px;
          color: rgba(255,255,255,0.25);
          margin-top: 2px;
        }

        .auth-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          margin-top: 4px;
          position: relative;
          overflow: hidden;
        }

        .auth-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .auth-btn:hover::before { opacity: 1; }

        .auth-btn:hover {
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
          transform: translateY(-1px);
        }

        .auth-btn:active { transform: translateY(0); }

        .auth-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .auth-btn-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .auth-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="auth-bg">
        <div className="auth-bg-grid" />
        <div className="auth-bg-orb auth-bg-orb-1" />
        <div className="auth-bg-orb auth-bg-orb-2" />
        <div className="auth-bg-orb auth-bg-orb-3" />
      </div>

      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon">⚡</div>
          <span className="auth-logo-text">ZapAgent</span>
        </div>

        <div className="auth-card">
          <h1 className="auth-card-title">Redefinir senha</h1>
          <p className="auth-card-subtitle">Escolha uma nova senha para sua conta</p>

          {error && (
            <div className="auth-error-banner">
              <span>✕</span>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="password">Nova senha</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                autoComplete="new-password"
                className="auth-input"
              />
              <p className="auth-hint">Use pelo menos 8 caracteres com letras e números</p>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm_password">Confirmar nova senha</label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                placeholder="Repita a senha"
                required
                autoComplete="new-password"
                className="auth-input"
              />
            </div>

            <button
              type="submit"
              className="auth-btn"
              disabled={isPending}
            >
              {isPending ? (
                <span className="auth-btn-loading">
                  <span className="auth-spinner" />
                  Salvando...
                </span>
              ) : (
                'Salvar nova senha'
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
