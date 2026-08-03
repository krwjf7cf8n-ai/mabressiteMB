# Plano de segurança e LGPD (Fase 1/MVP)

## Autenticação e sessão

- NextAuth (Credentials Provider), senha com hash `bcrypt` (12 rounds).
- Sessão JWT com expiração de 8 horas.
- Falhas de login e logins bem-sucedidos são auditados (`AuditLog`, ação
  `login`/`login_failed`), com IP quando disponível.
- 2FA: reservado (`User.twoFactorEnabled`), não implementado nesta fase.

## Autorização (RBAC)

- Toda mutação sensível passa por `requirePermission(chave)` no servidor —
  nunca confiar apenas na UI esconder um botão.
- Dados financeiros do cliente (`ContactFinancialInfo`) só aparecem para quem
  tem `contacts:view_financial`.

## Dados sensíveis

- Nenhuma senha, token de integração ou dado bancário é armazenado em texto
  plano: campos `*TokenEnc`, `bankDataEncrypted` são criptografados na camada
  de aplicação (chave `ENCRYPTION_KEY`, fora do código) — a implementação da
  rotina de cifragem entra junto com a primeira integração real que precisar
  gravar um token (Fase 3+).
- Logs nunca devem conter tokens, senhas, documentos completos ou dados
  bancários — `recordAudit` só recebe os campos explicitamente passados pelo
  código de cada módulo (nunca o objeto inteiro).

## LGPD

- `ConsentRecord` guarda finalidade, origem e data de cada consentimento.
- Retenção: campos `retentionUntil` existem em `PropertyDocument` e
  `FinancingChecklistItem`, mas **sem prazo padrão definido** — política
  definitiva pendente de validação jurídica (ver seção 11 do briefing).
- `OrgSetting` guarda o contato do encarregado/responsável LGPD, configurável
  pelo administrador; hoje sem valor definido (placeholder no seed).
- Soft delete em todas as entidades de negócio principais — nada é apagado
  fisicamente por padrão; exclusão definitiva é uma operação administrativa
  futura, não implementada nesta fase.

## Cabeçalhos e transporte

- HTTPS obrigatório em produção (responsabilidade da hospedagem/CDN).
- Cabeçalhos de segurança aplicados em `apps/web/next.config.mjs`:
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Content-Security-Policy`.

## Pendências desta fase (não bloqueiam o MVP, mas precisam de decisão futura)

- Rotina de criptografia de tokens de integração (entra com a 1ª integração real).
- Rate limiting nas rotas públicas (entra com a API de leads do site, Fase 6).
- Tela de administração de retenção/anonimização (schema pronto, UI pendente).
- Revisão jurídica de política de privacidade e termos de uso.
