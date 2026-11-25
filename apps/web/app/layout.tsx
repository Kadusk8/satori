import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { iosStartupImages } from "@/lib/pwa/ios-splash";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/pwa/install-event";
import { iconUrl } from "@/lib/pwa/icons";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Satori",
  description: "Plataforma SaaS de atendimento automatizado via WhatsApp com IA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    // Nome embaixo do ícone na tela inicial do iPhone.
    title: "Satori",
    // Sem isso o app instalado abre com tela branca no iPhone.
    startupImage: iosStartupImages(),
  },
  icons: {
    icon: [
      { url: iconUrl("icon.svg"), type: "image/svg+xml" },
      { url: iconUrl("icon-192.png"), sizes: "192x192", type: "image/png" },
    ],
    // Ícone da tela inicial do iPhone. O iOS só lê ao "Adicionar à Tela de Início".
    apple: iconUrl("apple-touch-icon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        {/* Captura o evento de instalação antes da hidratação (ver lib/pwa/install-event.ts). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Recuo do notch: no app instalado no iPhone o toast ficava sob o relógio. */}
        <Toaster
          richColors
          position="top-right"
          offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}
          mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
