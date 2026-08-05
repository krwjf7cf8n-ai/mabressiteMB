# Plano de integrações

Nenhuma integração externa está ativa nesta fase. Este documento registra o
contrato (interfaces em `apps/worker/src/providers/types.ts`) e o que falta
para cada uma virar realidade.

## Meta Lead Ads (Fase 3 — ainda não iniciada)

- Situação: nenhum app criado no Meta for Developers até o momento.
- Interface: `MetaLeadAdsProvider` (verificação de assinatura de webhook,
  parse de notificação `leadgen`).
- Implementação atual: `MockMetaLeadAdsProvider` — não valida assinatura real,
  usada só para testar o pipeline interno com payloads de exemplo.
- Pendente antes de ativar (`FEATURE_META_LEAD_ADS=true`):
  - App criado, permissões `leads_retrieval`, `pages_show_list` aprovadas.
  - Confirmar quais campanhas são formulário instantâneo vs. redirecionamento
    direto ao WhatsApp (impacta o que realmente chega por este canal).
  - Endpoint de webhook real (`/api/webhooks/meta`) e validação de assinatura
    `X-Hub-Signature-256` com `META_APP_SECRET`.

## WhatsApp Business Platform (Fase 4 — ainda não iniciada)

- Situação: uso atual é o app comum do WhatsApp Business, sem Cloud API oficial.
- Interface: `WhatsAppProvider`.
- Implementação atual: `MockWhatsAppProvider` — simula envio, não conecta à
  Cloud API.
- Não haverá importação automática do histórico do app atual — API oficial não
  permite isso. Migração de número/coexistência é decisão de negócio a avaliar
  antes da Fase 4.

## Google (Gmail + Calendar) (Fase 5 — ainda não iniciada)

- Situação: contas Gmail individuais dos corretores; Workspace ainda não
  confirmado.
- Interface: `GoogleCalendarProvider`, `GmailProvider`.
- Implementação atual: mocks, sem OAuth real.
- Desenho: cada usuário conecta a própria conta via OAuth 2.0
  (`GoogleAccount` por `User`), nunca uma senha compartilhada.

## e-Móvel Brokers (Fase 6 — bloqueada até confirmação oficial)

- Situação: contrato ativo, mas **nenhuma API pública foi confirmada**.
- Interface reservada: `EmovelProvider` (`createProperty`, `updateProperty`,
  `updatePrice`, `updateAvailability`, `inactivateProperty`, `getSyncStatus`).
- Implementação atual: `NotConfiguredEmovelProvider` — todo método lança erro
  explícito. Não há scraping nem automação de navegador.
- Antes de implementar de verdade, solicitar por escrito ao suporte:
  API REST, webhooks, documentação, XML (schema, import/export), autenticação,
  limites, custos, envio/atualização de imóveis, inativação, recebimento de
  leads do site.
- Fonte de verdade combinada: e-Móvel é a fonte principal do cadastro de
  imóveis publicados; o CRM guarda cópia/referência (`Property.externalRef`,
  `sourceSystem`) para relacionar com leads e negociações, sem sobrescrever o
  e-Móvel até a integração ser confirmada.

## Site oficial da Mabres

- O site está vinculado ao e-Móvel Brokers — a integração de leads do site
  depende do que o e-Móvel disponibilizar oficialmente (ver acima).
- O repositório estático atual (`mabressiteMB`, raiz do repo) não tem qualquer
  captura de lead server-side hoje — os botões apenas abrem `wa.me`. Não foi
  migrado nem alterado nesta fase.
