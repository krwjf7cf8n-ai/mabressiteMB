# Release Notes — Marco 1

**Data de encerramento:** 2026-08-05
**Status:** Homologado. Pronto para deploy assim que a infraestrutura real
(VPS, domínio, credenciais) estiver disponível — ver seção "O que falta"
abaixo e o relatório completo do Sprint 8 na PR #1.

## O que é o Marco 1

Um CRM imobiliário completo para a Mabres Negócios Imobiliários (Sorocaba/
Votorantim, SP), cobrindo o ciclo operacional do dia a dia de uma
corretora: captação e funil de leads, imóveis e proprietários, matching
determinístico entre cliente e imóvel, agenda de visitas, tarefas,
notificações, importação de dados legados e administração completa de
usuários/permissões — com auditoria, controle de acesso e infraestrutura de
produção prontos desde o primeiro dia.

## Principais entregas

- **CRM completo**: Leads/Clientes, Imóveis, Proprietários, Matching,
  Visitas, Tarefas, Dashboard, Notificações, Importação CSV, Administração
  (usuários/papéis/etapas do funil).
- **Segurança**: autenticação com sessão revogável, RBAC configurável (70
  permissões, 4 papéis padrão editáveis), escopo por dono/responsável em
  todos os módulos operacionais, rate limiting no login, criptografia de
  campos sensíveis, CSP e headers de segurança, auditoria completa
  (`AuditLog` append-only com redação automática), conformidade LGPD
  (consentimento registrado, dados nunca expostos fora de escopo).
- **Qualidade**: 421 testes automatizados (335 Vitest + 86 Playwright E2E),
  todos contra banco/Redis reais — não mocks. Pipeline de CI validado de
  ponta a ponta no GitHub Actions (não só localmente).
- **Infraestrutura pronta para produção**: Docker Compose para staging e
  produção, backup/restore automatizados, healthcheck, monitoramento
  (Sentry opcional), e um guia operacional completo (deploy, atualização,
  rollback, backup, restore, recuperação de desastre, checklist de
  produção, troubleshooting).

## Dois bugs críticos corrigidos na homologação final

1. **Auditoria de preço/status de imóvel falhava silenciosamente.** Toda
   atualização de preço ou status de um imóvel tinha sua entrada no
   `AuditLog` descartada por um erro de serialização — a mudança em si era
   salva normalmente, só o registro de auditoria se perdia, sem nenhum
   aviso visível. Corrigido na função compartilhada de redação de
   auditoria, protegendo esse e qualquer call site futuro.
2. **O pipeline de CI nunca tinha passado de verdade no GitHub Actions.**
   Três dos cinco jobs falhavam consistentemente (faltava Redis em dois
   deles; um diff de git incompatível com checkout raso no terceiro) — a
   validação "verde" reportada em sprints anteriores sempre foi feita
   localmente, nunca confirmada contra a execução real no GitHub. Corrigido
   e confirmado: todos os jobs relevantes agora passam de verdade.

## O que NÃO está incluído neste Marco (fica para o Marco 2)

Propostas, Contratos, Comissões, gestão de Documentos, Kanban visual,
módulo de Inteligência Artificial, e as integrações reais com WhatsApp
Business API, Google (Gmail/Calendar) OAuth, e-Móvel Brokers e Meta Lead
Ads. O schema de dados para todas essas áreas já existe; nenhuma dessas
funcionalidades foi iniciada.

## O que falta para o go-live real (depende de infraestrutura externa)

- VPS contratado e domínio da Mabres com DNS configurado.
- Segredos de produção gerados (nunca os mesmos valores usados em
  desenvolvimento).
- Conta de armazenamento externo para backup fora do VPS (opcional, mas
  recomendado — sem ela, a proteção é só contra erro operacional, não
  contra perda do VPS inteiro).
- Branch protection e MFA configurados manualmente no GitHub (documentado
  em `docs/ops/branch-protection.md` — hoje `main` não está protegida).
- Conta Sentry (opcional — o sistema funciona normalmente sem monitoramento
  externo de erros).

Nenhum desses itens foi inventado ou simulado neste projeto — cada um tem
um espaço reservado (variável de ambiente vazia, documentação do passo
manual) esperando o valor real.

## Como validar esta entrega

Ver `docs/ops/production-checklist.md` para o checklist operacional
completo, e o relatório do Sprint 8 na PR #1 para os resultados detalhados
de toda a homologação (funcional, operacional, segurança, qualidade).
