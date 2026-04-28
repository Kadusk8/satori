import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera build standalone — necessário para Railway/Docker
  // No Vercel isso é ignorado (usa o output padrão)
  output: "standalone",

  images: {
    remotePatterns: [
      // Cloudinary — imagens de produtos
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Supabase Storage — avatars e arquivos
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
