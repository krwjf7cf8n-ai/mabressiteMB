# Branch protection e MFA — requisitos operacionais

Sprint 7 (infra). Estas duas coisas dependem de configuração manual nas
telas do GitHub (organização/repositório) — nenhum código neste repositório
consegue aplicá-las sozinho. Documentado aqui em vez de implementado.

## Estado atual (confirmado nesta data)

A branch `main` deste repositório **não está protegida**
(`protected: false`, confirmado via API do GitHub). Configurar a proteção
abaixo é uma pendência real, não hipotética.

## Branch protection recomendada para `main`

Em GitHub → Settings → Branches → Add branch protection rule, para `main`:

- **Require a pull request before merging** — nenhum push direto em `main`.
  - Require approvals: pelo menos 1.
  - Dismiss stale pull request approvals when new commits are pushed.
- **Require status checks to pass before merging**, com os jobs do
  `.github/workflows/ci.yml` marcados como obrigatórios:
  - `Verificação de .env e segredos` (`secrets-check`)
  - `Install, lint e typecheck` (`install-and-static-checks`)
  - `Testes, migrations e build` (`test-and-migrations`)
  - `E2E — controle de acesso e escopo (Playwright)` (`e2e-security-specs`)
  - (`Auditoria básica de dependências` é informativo —
    `continue-on-error: true` no próprio workflow — não precisa ser
    obrigatório.)
  - Require branches to be up to date before merging.
- **Do not allow force pushes** para `main`.
- **Do not allow deletions** para `main`.
- Opcional, recomendado conforme a equipe crescer: **Require signed
  commits**.

## Regra específica deste projeto: PRs não são mesclados automaticamente

Além da configuração de branch protection do GitHub, este projeto segue uma
regra operacional própria (não é uma configuração do GitHub, é uma prática
da equipe): nenhuma PR é mesclada sem revisão e aprovação explícita da
Mabres — isso vale mesmo com todos os checks de CI verdes. `auto-merge` não
deve ser habilitado nas PRs deste repositório.

## MFA — requisito operacional

MFA (autenticação multifator) é obrigatório, nesta ordem de prioridade, para
qualquer conta com acesso a:

1. **GitHub** (organização e/ou conta que administra este repositório) —
   GitHub → Settings → Password and authentication → habilitar 2FA. Para
   organizações, é possível **exigir** 2FA de todos os membros em
   Organization Settings → Authentication security.
2. **VPS de produção/staging** (acesso SSH) — preferir autenticação por
   chave SSH (não senha) como controle equivalente; se o provedor do VPS
   tiver painel web de gestão, habilitar MFA nesse painel também.
3. **Registrador de domínio / DNS** — quem controla o DNS de produção
   controla para onde o tráfego (e a emissão de certificado TLS) vai.
4. **Conta de observabilidade** (Sentry, se/quando existir) — opcional
   nesta fase, mas o mesmo requisito vale quando for criada.

Nenhuma dessas contas existe ainda neste momento (ver a lista de
dependências de infraestrutura real no relatório do Sprint 7 na PR #1) —
este documento fixa o requisito para quando forem criadas, não confirma que
já está configurado.
