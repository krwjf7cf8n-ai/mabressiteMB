# Sprint 7 (infra) — imagem de produção do apps/web.
#
# Build a partir da raiz do monorepo (crm/):
#   docker build -f apps/web/Dockerfile -t mabres-web .
#
# Decisão registrada em docs/decisions/0002-infraestrutura-deploy.md: NÃO
# usamos `next build` em modo "standalone" para copiar um node_modules
# reduzido — testado durante o Sprint 7, o rastreamento de dependências do
# Next (`.next/standalone`) não inclui corretamente o engine nativo do
# Prisma Client neste layout de monorepo pnpm (o binário fica aninhado
# dentro do próprio pacote @prisma/client no virtual store do pnpm, fora do
# alcance do tracer). Em vez disso, copiamos o node_modules completo — já
# validado pelo pipeline de CI existente (mesma sequência: install, prisma
# generate, next build, next start) — priorizando confiabilidade sobre
# tamanho de imagem nesta fase.
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
ENV TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# O Prisma Client é gerado a partir do schema — não precisa de um banco real
# no momento do build, mas a variável precisa existir para o comando não falhar.
ARG DATABASE_URL=postgresql://user:password@localhost:5432/build_placeholder
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm db:generate
RUN pnpm --filter @mabres/web build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
WORKDIR /repo
COPY --from=builder --chown=nextjs:nodejs /repo ./
USER nextjs
WORKDIR /repo/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
