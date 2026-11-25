import type { MetadataRoute } from 'next'
import { iconUrl } from '@/lib/pwa/icons'

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identidade do app instalado. Fixada no valor que os apps já instalados
    // receberam implicitamente (= start_url original). NÃO mudar: o Chrome trataria
    // como outro app e quem já instalou ficaria com um app órfão.
    id: '/conversations',
    name: 'Satori — Atendimento Inteligente',
    short_name: 'Satori',
    description: 'Plataforma SaaS de atendimento automatizado via WhatsApp com IA',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/conversations',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    orientation: 'any',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    // URLs versionadas: mudar a URL faz o Android atualizar o ícone do app já instalado.
    icons: [
      { src: iconUrl('icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: iconUrl('icon-512.png'), sizes: '512x512', type: 'image/png' },
      { src: iconUrl('icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Atalhos no toque longo do ícone (Android).
    shortcuts: [
      { name: 'CRM', short_name: 'CRM', url: '/conversations', icons: [{ src: iconUrl('icon-192.png'), sizes: '192x192' }] },
      { name: 'Agenda', short_name: 'Agenda', url: '/appointments', icons: [{ src: iconUrl('icon-192.png'), sizes: '192x192' }] },
    ],
  }
}
