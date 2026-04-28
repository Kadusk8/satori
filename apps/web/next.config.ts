import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
