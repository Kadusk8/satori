'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '../actions'

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      await requestPasswordReset(formData)
      setSubmitted(true)
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
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #6366f1, transparent);
          top: -200px;
          right: -100px;
          animation: float1 8s ease-in-out infinite;
        }

        .auth-bg-orb-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #8b5cf6, transparent);
          bottom: -150px;
          left: -100px;
          animation: float2 10s ease-in-out infinite;
        }

        .auth-bg-orb-3 {
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, #06b6d4, transparent);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: float3 6s ease-in-out infinite;
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
          50% { transform: translate(-30px, 30px) scale(1.05); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -20px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.25; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.15; }
        }

        .auth-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
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

        .auth-success-banner {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #34d399;
          line-height: 1.5;
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

        .auth-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: rgba(255,255,255,0.35);
        }

        .auth-footer a {
          color: #818cf8;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .auth-footer a:hover { color: #a5b4fc; }
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
          <h1 className="auth-card-title">Esqueci minha senha</h1>
          <p className="auth-card-subtitle">Informe seu email e enviaremos um link para redefinir sua senha</p>

          {submitted ? (
            <div className="auth-success-banner">
              <span>✓</span>
              Se existir uma conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
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
                    Enviando...
                  </span>
                ) : (
                  'Enviar link de redefinição'
                )}
              </button>
            </form>
          )}
        </div>

        <div className="auth-footer">
          Lembrou a senha?{' '}
          <Link href="/login">Entrar</Link>
        </div>
      </div>
    </>
  )
}
