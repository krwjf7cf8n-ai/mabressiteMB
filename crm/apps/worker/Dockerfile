# Sprint 7 (infra) — imagem de produção do apps/worker.
#
# Build a partir da raiz do monorepo (crm/):
#   docker build -f apps/worker/Dockerfile -t mabres-worker .
#
# O worker roda via `tsx` mesmo em produção (não `node dist/index.js`) — ver
# apps/worker/package.json e o commit que introduziu essa mudança: @mabres/db
# e @mabres/shared são consumidos como fonte TypeScript de workspace, e só o
# bundler do Next (que segue os symlinks do pnpm) resolve isso sem um passo
# de transpilação em runtime. `tsc`/"build" continuam existindo como checagem
# de compilação (usados no CI), mas não são o que roda no container.
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
ARG DATABASE_URL=postgresql://user:password@localhost:5432/build_placeholder
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm db:generate
# Checagem de compilação (não é o artefato executado em runtime — ver nota acima).
RUN pnpm --filter @mabres/worker build

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m worker
WORKDIR /repo
COPY --from=builder --chown=worker:nodejs /repo ./
USER worker
WORKDIR /repo/apps/worker
CMD ["pnpm", "start"]
