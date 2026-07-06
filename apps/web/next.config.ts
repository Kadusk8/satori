import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // O harness interno que o Next.js injeta em TODO middleware de Edge Runtime
  // (não é código nosso — não dá pra corrigir via webpack config) referencia
  // `__dirname`, que não existe no isolamento V8 real da Vercel em produção
  // → ReferenceError em toda rota. Não reproduz local (`next start` emula o
  // Edge Runtime de forma mais permissiva que o isolado real da Vercel).
  // Rodar o middleware sob runtime Node.js de verdade evita esse harness de
  // Edge por completo — não precisa de flag aqui, só do `export const config
  // = { runtime: 'nodejs' }` no próprio middleware.ts.
};

export default nextConfig;
