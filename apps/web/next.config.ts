import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Vários módulos bundled no middleware (ua-parser-js, ncc internals do Next.js)
  // usam `__dirname` nas suas IIFEs internas de webpack (g.ab = __dirname + "/").
  // No Edge Runtime da Vercel, `__dirname` não existe → ReferenceError.
  // DefinePlugin substitui o token `__dirname` por '/' em TODOS os módulos
  // durante a compilação, incluindo IIFEs embeddadas de terceiros.
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime === "edge") {
      config.plugins = [
        ...(config.plugins ?? []),
        new webpack.DefinePlugin({
          __dirname: JSON.stringify("/"),
          __filename: JSON.stringify("/index.js"),
        }),
      ];
    }
    return config;
  },
};

export default nextConfig;
