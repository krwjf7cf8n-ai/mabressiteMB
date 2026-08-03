# ADR 0001 — Stack e organização do monorepo

**Status:** aceito

## Contexto

Precisávamos de uma stack barata (orçamento-alvo até R$ 300/mês fora custos
variáveis), fácil de manter por uma equipe pequena, e que suporte webhooks e
processamento assíncrono desde o início sem exigir reescrita ao crescer.

## Decisão

- Monorepo pnpm (`apps/web`, `apps/worker`, `packages/db`, `packages/shared`).
- Next.js 14 App Router + TypeScript + Tailwind no frontend/dashboard.
- Worker Node.js separado para filas (BullMQ + Redis) e integrações.
- PostgreSQL + Prisma, um schema único compartilhado via `packages/db`.
- NextAuth (Credentials) com RBAC em tabelas, não hardcoded.

## Alternativas consideradas

- Backend separado em NestJS: mais estrutura, mas custo de manutenção maior
  para 2 usuários iniciais. Reavaliar se a equipe crescer muito.
- Serverless puro (functions): fraco para processamento assíncrono robusto de
  webhooks/filas — descartado.

## Consequências

- Lógica de domínio isolada em `packages/` permite migrar o worker para outra
  infraestrutura (ex.: AWS) no futuro sem reescrever regras de negócio.
- Login/senha próprios exigem manutenção de hashing e política de senha —
  aceito pela simplicidade inicial; Google OAuth como login pode ser adicionado
  depois sem mudar o schema (`User.passwordHash` já é opcional).
