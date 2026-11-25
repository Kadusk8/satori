'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Download, ExternalLink, MoreVertical, PlusSquare, Share, Smartphone } from 'lucide-react'
import { SatoriLogo } from '@/components/brand/satori-logo'
import { detectPlatform, iosSupportsWebPush, type PwaPlatform } from '@/lib/pwa/platform'
import { getInstallPrompt, onInstallPromptChange, promptInstall } from '@/lib/pwa/install-event'

type Scenario =
  | 'installed'
  | 'android-prompt'
  | 'android-manual'
  | 'android-in-app'
  | 'ios-safari'
  | 'ios-other-browser'
  | 'ios-old'
  | 'desktop'

function pickScenario(p: PwaPlatform, hasPrompt: boolean): Scenario {
  if (p.isStandalone) return 'installed'
  if (p.isIOS) {
    if (p.isIOSNonSafari) return 'ios-other-browser'
    if (!iosSupportsWebPush(p)) return 'ios-old'
    return 'ios-safari'
  }
  if (p.isAndroid) {
    if (p.isInAppBrowser) return 'android-in-app'
    return hasPrompt ? 'android-prompt' : 'android-manual'
  }
  return 'desktop'
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-semibold text-cyan-300">
        {n}
      </span>
      <div className="pt-0.5 text-zinc-300">{children}</div>
    </li>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch {
          // Clipboard indisponível (navegador embutido antigo): o link está visível na tela.
        }
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
    >
      {copied ? <Check className="h-4 w-4 text-cyan-400" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Link copiado' : 'Copiar link'}
    </button>
  )
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<PwaPlatform | null>(null)
  const [hasPrompt, setHasPrompt] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setPlatform(detectPlatform())
    setOrigin(window.location.host)
    setHasPrompt(getInstallPrompt() !== null)
    return onInstallPromptChange(() => {
      setHasPrompt(getInstallPrompt() !== null)
      setPlatform(detectPlatform())
    })
  }, [])

  // Ainda detectando (1º render, igual no servidor e no cliente).
  if (!platform) {
    return <div className="h-64" aria-busy="true" />
  }

  const scenario = pickScenario(platform, hasPrompt)

  async function handleInstall() {
    setInstalling(true)
    try {
      await promptInstall()
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="space-y-6">
      {scenario === 'installed' && (
        <>
          <p className="text-zinc-300">O Satori já está instalado neste aparelho.</p>
          <Link
            href="/conversations"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            Abrir o Satori
          </Link>
          <p className="text-sm text-zinc-500">
            Depois de entrar, toque em <strong className="text-zinc-300">Ativar notificações</strong> no topo da tela
            para ser avisado quando um cliente precisar de atendimento.
          </p>
        </>
      )}

      {scenario === 'android-prompt' && (
        <>
          <p className="text-zinc-300">Instale o app para receber avisos de novos atendimentos, mesmo com o celular bloqueado.</p>
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Instalar Satori
          </button>
        </>
      )}

      {scenario === 'android-manual' && (
        <ol className="space-y-4">
          <Step n={1}>
            Toque no menu <MoreVertical className="inline h-4 w-4 align-text-bottom" /> no canto superior direito do navegador.
          </Step>
          <Step n={2}>
            Escolha <strong className="text-zinc-100">Instalar app</strong> ou{' '}
            <strong className="text-zinc-100">Adicionar à tela inicial</strong>.
          </Step>
          <Step n={3}>Confirme. O ícone do Satori aparece junto com os seus outros apps.</Step>
        </ol>
      )}

      {scenario === 'android-in-app' && (
        <>
          <p className="text-zinc-300">
            Você abriu este link dentro de outro app (WhatsApp, Instagram…), que não consegue instalar aplicativos.
            Abra no Chrome:
          </p>
          <a
            // intent:// abre direto no Chrome a partir do navegador embutido do Android.
            href={`intent://${origin}/instalar#Intent;scheme=https;package=com.android.chrome;end`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir no Chrome
          </a>
          <p className="text-sm text-zinc-500">
            Se o botão não funcionar: toque em <MoreVertical className="inline h-4 w-4 align-text-bottom" /> e escolha{' '}
            <strong className="text-zinc-300">Abrir no navegador</strong>.
          </p>
        </>
      )}

      {scenario === 'ios-safari' && (
        <>
          <ol className="space-y-4">
            <Step n={1}>
              Toque no botão <strong className="text-zinc-100">Compartilhar</strong>{' '}
              <Share className="inline h-4 w-4 align-text-bottom text-cyan-400" /> na barra do Safari.
            </Step>
            <Step n={2}>
              Role a lista e toque em <strong className="text-zinc-100">Adicionar à Tela de Início</strong>{' '}
              <PlusSquare className="inline h-4 w-4 align-text-bottom text-cyan-400" />.
            </Step>
            <Step n={3}>
              Toque em <strong className="text-zinc-100">Adicionar</strong>, no canto superior direito.
            </Step>
            <Step n={4}>
              Abra o Satori <strong className="text-zinc-100">pelo ícone novo</strong>, entre e toque em{' '}
              <strong className="text-zinc-100">Ativar notificações</strong>.
            </Step>
          </ol>
          <p className="rounded-xl border border-cyan-900 bg-cyan-950/40 p-3 text-sm text-cyan-100">
            No iPhone, os avisos de atendimento só funcionam pelo app instalado — não pelo Safari.
          </p>
        </>
      )}

      {scenario === 'ios-other-browser' && (
        <>
          <p className="text-zinc-300">
            No iPhone, o app é instalado pelo <strong className="text-zinc-100">Safari</strong>. Copie o link e cole no
            Safari:
          </p>
          <p className="break-all rounded-xl bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-200">
            {origin}/instalar
          </p>
          <CopyLinkButton />
        </>
      )}

      {scenario === 'ios-old' && (
        <>
          <p className="text-zinc-300">
            Seu iPhone está com uma versão do iOS anterior à 16.4. Dá para usar o Satori pelo Safari e adicionar à Tela de
            Início, mas <strong className="text-zinc-100">os avisos de atendimento não funcionam</strong> nessa versão.
          </p>
          <p className="text-sm text-zinc-500">
            Para receber avisos, atualize em Ajustes → Geral → Atualização de Software.
          </p>
        </>
      )}

      {scenario === 'desktop' && (
        <>
          <div className="flex items-start gap-3 text-zinc-300">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
            <p>
              O app do Satori é instalado no celular. Abra este endereço no navegador do seu celular (Safari no iPhone,
              Chrome no Android):
            </p>
          </div>
          <p className="break-all rounded-xl bg-zinc-900 px-4 py-3 text-center font-mono text-sm text-zinc-200">
            {origin}/instalar
          </p>
          <CopyLinkButton />
        </>
      )}
    </div>
  )
}

export function InstallGuideShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-zinc-950 px-5 pb-safe pt-safe sm:items-center">
      <div className="w-full max-w-md py-10">
        <SatoriLogo markClassName="h-9 w-9" />
        <h1 className="mt-8 text-2xl font-semibold text-zinc-100">Instale o app do Satori</h1>
        <p className="mt-2 mb-8 text-zinc-400">Atenda seus clientes pelo celular e seja avisado na hora.</p>
        {children}
      </div>
    </main>
  )
}
