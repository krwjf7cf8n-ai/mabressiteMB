/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    // Sprint 7 (infra) — necessário para o Next 14 carregar instrumentation.ts
    // (onde o Sentry é inicializado condicionalmente, só se SENTRY_DSN existir).
    instrumentationHook: true,
    // @sentry/node usa módulos nativos do Node (ex.: node:child_process) que
    // o webpack não consegue empacotar — precisa rodar via require() normal
    // do Node em vez de ser incluído no bundle do servidor.
    serverComponentsExternalPackages: ["@sentry/node"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
