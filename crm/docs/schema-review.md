# Revisão do schema (antes do PR da Fase 1)

Revisão solicitada explicitamente antes de avançar. Objetivo: confirmar que o
schema não está "inchado" apenas porque o briefing lista todos os módulos —
separar o que já sustenta código real do que é preparação para fases futuras,
e registrar ajustes aplicados nesta revisão.

## Tabelas já realmente usadas (têm código de leitura/escrita hoje)

`User`, `Role`, `Permission`, `RolePermission`, `PipelineStage`, `Contact`,
`ContactStageHistory`, `ConsentRecord` (criado via nested write no cadastro),
`AuditLog` (escrita via `recordAudit` em todo login/mutação), `Task` (lido no
dashboard e no job de tarefas vencidas do worker), `Visit` (lido no dashboard),
`Notification` (escrito pelo worker), `OrgSetting` (seed).

`ContactFinancialInfo` está em uma posição intermediária: já tem **leitura**
condicionada a `contacts:view_financial` na tela de detalhe do lead, mas ainda
não existe formulário de escrita — não é usado de ponta a ponta ainda.

## Tabelas preparadas para fases futuras (schema existe, sem código de app ainda)

`ContactTag`, `ContactPreference`, `Property` e toda a família
(`PropertyPhoto`, `PropertyDocument`, `PropertyPriceHistory`,
`PropertyStatusHistory`), `Owner`, `PropertyOwner`, `Match`, `Proposal`,
`ProposalVersion`, `Contract`, `Commission`, `CommissionSplit`,
`FinancingChecklistItem`, `Automation`/`AutomationRun`/`AutomationLog`,
`IntegrationAccount`, `GoogleAccount`, `WebhookEvent`, `AiUsageLog`,
`ImportJob`/`ImportError`.

Essas tabelas entram em uso nas Fases 1.1 a 1.5 descritas no plano de
continuidade. Mantidas no schema desde já para não exigir migração destrutiva
quando as telas forem construídas — mas nenhuma delas tem dado real hoje.

## Relacionamentos ainda não validados por código real

- `Contact.sourcePropertyId → Property` ("ContactSourceProperty"): schema
  pronto, nunca exercido (não há imóvel cadastrado ainda).
- `Contact.duplicateOfId → Contact` ("ContactDuplicate"): **declarado mas não
  implementado**. Hoje a tela de novo lead só *avisa* sobre duplicidade
  (`findDuplicateMatches`) e deixa o corretor decidir cadastrar mesmo assim —
  não existe ainda a ação de "vincular como duplicata" que gravaria esse
  campo. Fica registrado aqui para não ser confundido com funcionalidade
  pronta; entra como tarefa explícita quando o fluxo de mesclagem for
  priorizado.
- Toda a árvore de relações de `Property` (owners, photos, matches, visits,
  proposals) — sem dado real para validar cardinalidade em produção ainda.

## Campos redundantes corrigidos nesta revisão

- `Property.customHighlights` (String[]) duplicava o propósito de
  `Property.highlights` (String[]) — ambos representavam "diferenciais do
  imóvel" em pontos diferentes do schema. **Removido `customHighlights`**;
  `highlights` é o único campo de diferenciais daqui em diante (migration
  `20260803175329_schema_review_adjustments`). Nenhum código dependia do campo
  removido (schema ainda não tinha UI de imóveis).

## Enums que podem dificultar personalização futura

Etapas do funil (`PipelineStage`) já são uma tabela configurável — isso foi
decisão deliberada desde a Fase 1. Os enums abaixo são fixos no schema
(Postgres `enum`), o que significa que adicionar um novo valor exige migração:

- `ContactOrigin`, `VisitStatus`, `TaskStatus`, `TaskPriority`,
  `ProposalStatus`: representam estados de negócio que a Mabres pode querer
  ampliar (ex.: um novo motivo de status de visita) sem depender de deploy.
- Aceitável para o volume atual (2 usuários, dezenas de leads/mês) e mantém
  integridade referencial simples. **Recomendação**: se no futuro for
  necessário que o próprio administrador crie novos status pela interface
  (como já acontece com etapas do funil), migrar esses enums para tabelas de
  apoio configuráveis, no mesmo padrão de `PipelineStage`. Não fiz essa
  mudança agora por ser disruptiva sem necessidade comprovada — registrando
  como decisão consciente, não como pendência esquecida.
- Enums estruturais que **não** devem virar configuráveis (são realmente
  fixos do domínio, não preferência do usuário): `ActorType`,
  `ReasonRequirement`, `PropertySourceSystem`, `PropertyPurpose`,
  `IntegrationProvider`.

## Dados sensíveis que exigem criptografia adicional

- `Owner.bankDataEncrypted`: o nome do campo já sinalizava a intenção, mas
  **não havia rotina de criptografia implementada** até esta revisão — um
  valor gravado ali estaria em texto plano apesar do nome. Corrigido: criado
  `packages/shared/src/crypto.ts` (AES-256-GCM, chave via `ENCRYPTION_KEY`),
  com testes de round-trip. A Fase 1.1 (cadastro de proprietários) já usa essa
  função antes de gravar dados bancários — nunca grava em texto plano.
- `ContactFinancialInfo` (renda, valor aprovado, saldo FGTS): mantidos como
  colunas numéricas normais, protegidas por RBAC (`contacts:view_financial`) e
  pela criptografia em repouso do banco gerenciado — não recebem cifragem de
  aplicação porque são valores numéricos usados em cálculo/relatório, não
  credenciais. Documentos (`PropertyDocument`, `FinancingChecklistItem`) ainda
  vão depender de storage com URL assinada (Fase 1.1+/futuro), não de
  criptografia de coluna.

## Índices adicionados nesta revisão

- `Contact`: `@@index([createdAt])` — as consultas do dashboard (leads
  hoje/7/30/90 dias) filtram por intervalo de `createdAt` e não tinham índice
  para isso.
- `Visit`: `@@index([contactId])`, `@@index([propertyId])`,
  `@@index([brokerUserId])` — Prisma **não** cria índice automático em coluna
  de chave estrangeira simples (só em `@@unique`/`@id`); sem isso, "visitas do
  cliente X" ou "visitas do imóvel Y" fariam scan completo à medida que o
  volume crescer.
- `Task`: `@@index([contactId])`, `@@index([propertyId])` — mesmo motivo,
  usado nas Fases 1.1/1.3.
- Já existentes e confirmados corretos: `Contact` (phone, whatsapp, email,
  stageId, ownerUserId), `Property` (city+neighborhood, propertyType, status),
  `Visit.scheduledAt`, `Task` (assignedUserId+status, dueAt).

## Regras de unicidade — decisão deliberada

- **Não existe `@@unique` em `Contact.phone`/`whatsapp`/`email`.** Isso é
  intencional, não uma omissão: números de telefone podem ser compartilhados
  (casal, família) e e-mails corporativos podem se repetir entre contatos
  diferentes de uma mesma empresa. Bloquear por constraint de banco geraria
  falhas incorretas. A deduplicação é *consultiva* (`findDuplicateMatches`),
  avisa o corretor e deixa a decisão de mesclar/relacionar para ele —
  exatamente como pedido no briefing ("não apagar histórico, mostrar origem,
  pedir confirmação").
- `Contact.metaLeadId` tem `@unique` — esse sim deve ser único, é a chave de
  idempotência do webhook da Meta (mesmo lead não pode ser processado duas
  vezes).
- `Property.internalCode` tem `@unique` — código interno gerado pelo CRM, não
  há cenário legítimo de duplicidade.
- `WebhookEvent` tem `@@unique([provider, externalId])` — idempotência de
  qualquer webhook por provedor.

## Datas e fuso horário

Todas as colunas `DateTime` do Prisma são geradas como `TIMESTAMP(3)` (sem
timezone) no Postgres, com `DEFAULT CURRENT_TIMESTAMP` quando aplicável. Isso
é seguro **desde que o servidor Postgres tenha a sessão em UTC** — confirmado
`Etc/UTC` no ambiente local desta revisão. A aplicação sempre grava/lê via
`Date` do JavaScript (instantes UTC) e só formata para `America/Sao_Paulo` na
camada de apresentação (`packages/shared/src/format.ts`, via `Intl` com
`timeZone` explícito) — nunca faz aritmética de data assumindo fuso local.
**Ação recomendada ao contratar o Postgres gerenciado de produção**: confirmar
explicitamente que o servidor está configurado para UTC (a maioria dos
provedores gerenciados já usa UTC por padrão, mas isso deve ser verificado, não
assumido).
