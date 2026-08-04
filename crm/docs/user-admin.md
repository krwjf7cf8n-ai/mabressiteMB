# Administração de usuários, papéis e permissões (Fase 1.5)

## Escopo

Gestão de usuários, papéis e permissões para um único escritório (sem
multiempresa). Não implementados nesta fase: cobrança SaaS, convites
públicos por e-mail, login social, multiempresa.

## Modelagem do RBAC

`Role` ↔ `RolePermission` ↔ `Permission` (many-to-many em tabela, nada
hardcoded) já existia desde a Fase 1. Esta fase adiciona:

- `Role.isAdminRole` — flag booleana que marca o papel protegido pela regra
  do último administrador (só o "Administrador" seedado). **Não** usa
  comparação de nome — o nome do papel pode ser editado, a flag não.
- `Role.disabledAt` — papéis personalizados podem ser desativados (nunca
  excluídos fisicamente).
- `User.phone`, `mustChangePassword`, `disabledAt`/`disabledByUserId`/
  `disabledReason`, `createdByUserId`.
- `UserSession` (novo modelo) — ver "Sessões" abaixo.

## Sessões — revogação individual apesar do NextAuth ser stateless

A sessão do NextAuth usa estratégia **JWT** (sem tabela de sessão própria).
Para permitir revogar uma sessão específica (não só "todas de uma vez"),
cada login cria uma linha em `UserSession`, e o `jwt()` callback
(`apps/web/lib/auth.ts`) embute o `sessionId` no token. A cada requisição
que chama `getServerSession` (toda página e toda server action, via
`requireSession()`), o callback confere no banco se aquela sessão específica
ainda não foi revogada e se o usuário ainda está ativo — se não, o token é
marcado inválido e `session()` devolve uma sessão sem `user`, que
`requireSession()` trata como "não autenticado".

Isso significa: revogar uma sessão (desativação, redefinição de senha,
"encerrar sessão") tem efeito a partir da **próxima requisição** daquela
sessão — não existe um jeito de literalmente derrubar uma aba já aberta em
tempo real com sessão stateless, mas nenhuma ação protegida continua
funcionando depois disso, o que é a garantia que importa. Verificado com um
teste E2E real usando dois `BrowserContext` do Playwright (sessões
independentes) — a sessão revogada é redirecionada para `/login` na
requisição seguinte.

A troca de senha forçada (`mustChangePassword`) usa o mesmo mecanismo:
`requireSession()` redireciona para `/change-password` em qualquer página
enquanto a flag estiver ligada, exceto a própria tela de troca (que passa
`allowMustChangePassword: true` para não entrar em loop).

## Regras críticas de segurança

Todas em `packages/shared/src/rbac-guard.ts` (puras, testadas) +
`apps/web/lib/user-admin-service.ts`/`role-admin-service.ts` (parte que toca
banco):

### Nunca conceder acima do próprio nível

`assertNoPrivilegeEscalation(permissõesDoAtor, permissõesAlvo)` — toda
permissão do papel sendo criado/editado, ou atribuído a um usuário, precisa
já estar entre as permissões do ator. Aplicada em: criar usuário (permissões
do papel escolhido), criar papel, editar permissões de papel, duplicar
papel, trocar o papel de um usuário. A interface desabilita visualmente os
checkboxes de permissões que o ator não possui, mas isso é conveniência —
verificado com um teste E2E que força (via DOM) um checkbox desabilitado a
ficar marcado e confirma que o servidor rejeita mesmo assim.

### Ninguém troca o próprio papel

`assertNotSelfRoleChange` — bloqueado por identidade
(`targetUserId === actorUserId`), não por comparação de permissão. Evita
tanto auto-promoção quanto auto-rebaixamento acidental. A interface nem
mostra o formulário de troca de papel na própria página do usuário logado.

### O papel de administrador nunca é editado por aqui

`Role.isAdminRole` é estruturalmente protegido: `updateRolePermissions` e
`disableRole` rejeitam de cara se o papel alvo tem essa flag. Como o
Administrador tem literalmente todas as permissões (`resolveRolePermissions`
resolve `"*"` para a lista completa no seed), não existe "remover permissão
essencial do último administrador" para proteger — a permissão nunca é
editável nesse papel. Decisão registrada aqui como consciente, alinhada ao
modelo atual (não é uma trava arbitrária).

### Nunca fica sem administrador

`countActiveAdminsExcluding` roda **dentro da mesma transação** que a
desativação ou troca de papel, e trava as linhas envolvidas com
`SELECT ... FOR UPDATE` antes de decidir:

```sql
SELECT u.id FROM users u
JOIN roles r ON r.id = u."roleId"
WHERE r."isAdminRole" = true
  AND u."isActive" = true AND u."deletedAt" IS NULL AND u."disabledAt" IS NULL
  AND u.id != :excludeUserId
FOR UPDATE OF u
```

Isso serializa duas operações concorrentes contra os últimos administradores
— a segunda só decide depois que a primeira já commitou, então nunca as duas
"acham" que ainda sobra um administrador ao mesmo tempo. Testado com
`Promise.allSettled` disparando duas desativações simultâneas nos dois
últimos administradores: sempre exatamente uma sucede, a outra falha (com
`LastAdminError` da aplicação **ou** um deadlock do Postgres detectado —
ambos são resultados aceitáveis, o que importa é que a contagem final nunca
chega a zero). Também verificado via UI real (desativar o segundo
administrador funciona, desativar o que sobrou é bloqueado com a mensagem
"a organização ficaria sem nenhum administrador ativo").

### Desativação nunca reatribui nem apaga nada sozinha

`disableUser` só marca `isActive=false`/`disabledAt`/`disabledReason` e
revoga sessões — **não** toca em `Contact.ownerUserId`, `Task.assignedUserId`,
`Visit.brokerUserId` ou `Property.responsibleUserId`. Esses registros
continuam apontando para o usuário desativado (histórico preservado) até uma
reatribuição explícita e confirmada.

## Reatribuição de registros

`reassignUserRecords` (transação única, com contagem por categoria e
auditoria) só move o que ainda está "em aberto":

| Categoria | Critério para reatribuir | O que fica preservado |
|---|---|---|
| Leads/clientes | `deletedAt IS NULL` | excluídos (soft delete) não são tocados |
| Tarefas | `status IN (PENDENTE, EM_ANDAMENTO)` | concluídas/canceladas mantêm o responsável original |
| Visitas | status não-terminal (não `REALIZADA`/`CANCELADA_*`) | realizadas/canceladas mantêm o corretor original |
| Imóveis | `responsibleUserId` + `deletedAt IS NULL` | — |

Propostas (`Proposal`) não entram — o módulo ainda não tem UI/uso real
nesta fase, não há nada de fato para reatribuir. Cada categoria é opcional
(o admin escolhe o que reatribuir na tela `/admin/users/[id]/reassign`), a
tela mostra as contagens antes de confirmar, e nada é reatribuído sem
confirmação explícita.

## Catálogo de permissões: domínio e risco

`packages/shared/src/permissions.ts` — cada permissão agora tem `domain`
(usuarios, papeis, auditoria, configuracoes, integracoes, leads, imoveis,
proprietarios, matching, visitas, tarefas, propostas, financeiro,
automacoes, relatorios, importacoes) e `risk` (baixo/médio/alto/crítico). A
tela de criar/editar papel agrupa por domínio com um `<fieldset>` por grupo
e uma pílula de risco ao lado de cada permissão — evita a "matriz gigante e
confusa" que o briefing pediu para não construir.

As antigas permissões-blob `users:manage`/`roles:manage` foram substituídas
pelo conjunto granular pedido: `users:view/create/update/disable/reactivate/
reset_password/terminate_sessions/reassign_records`, `roles:view/create/
update/disable/assign`, `permissions:view/assign`.

## Escopo

Diferente de leads/visitas/tarefas (que têm escopo próprio/equipe via pares
de permissão `:view`/`:view_all`), a administração de usuários e papéis é
**sempre organização inteira** — não existe "corretor só administra seus
próprios usuários" em um CRM de escritório pequeno. Decisão registrada aqui
explicitamente.

## Auditoria

Toda mutação grava `AuditLog` com ator, antes/depois, motivo quando
aplicável: `create`, `update` (dados básicos), `disable`, `reactivate`,
`role_change`, `password_reset_by_admin`, `password_change_self`,
`session_terminated`, `sessions_terminated_bulk`, `records_reassigned` (em
`User`); `create`, `update_permissions`, `disable` (em `Role`). Uma
tentativa bloqueada de elevação de privilégio ou de violar a regra do
último administrador **nunca chega a gravar nada** (a exceção é lançada
antes de qualquer escrita) — não haveria o que desfazer, e a rejeição em si
já é visível na resposta ao usuário. Nunca é gravado hash de senha, senha
temporária ou token em nenhum log.

## Senha temporária

Gerada por `generateTempPassword` (compartilhada entre o seed e os fluxos
administrativos), sempre satisfaz a política mínima (10+ caracteres, letra e
número — corrigido nesta fase: base64url puro ocasionalmente saía só com
letras). Exibida **uma única vez** na tela após criar o usuário ou redefinir
a senha, nunca logada, nunca persistida em texto claro (só o hash).

## Permissões desta administração

| Permissão | Uso |
|---|---|
| `users:view/create/update` | listar, criar, editar dados básicos |
| `users:disable`/`users:reactivate` | desativar/reativar |
| `users:reset_password` | gerar senha temporária para outro usuário |
| `users:terminate_sessions` | encerrar sessões de um usuário |
| `users:reassign_records` | reatribuir leads/tarefas/visitas/imóveis |
| `roles:view/create/update/disable` | gerenciar papéis |
| `roles:assign` | trocar o papel de um usuário |
| `permissions:view/assign` | ver/atribuir permissões (usado junto com `roles:*`) |

Todas aplicadas no servidor (`requirePermission`) — a UI esconde o que não
se aplica, mas isso é conveniência.

## Limitações conhecidas / débitos técnicos

- **Sem recuperação de senha por e-mail real** — não há serviço de e-mail
  configurado nesta fase (feature flags de integração seguem desligadas).
  Redefinição é sempre administrativa (gera senha temporária) ou o próprio
  usuário logado trocando a atual.
- **Revogação de sessão não é instantânea** — like todo esquema JWT +
  checagem por requisição, uma sessão revogada só é efetivamente barrada na
  próxima requisição, não há como invalidar uma aba já carregada em tempo
  real sem WebSocket/polling (fora do escopo desta fase).
- **`UserSession` não registra geolocalização nem dispositivo detalhado** —
  só IP (do header `x-forwarded-for`) e `User-Agent` bruto.
- **Sem 2FA** — `User.twoFactorEnabled` existe no schema desde a Fase 1,
  reservado para fase futura, não implementado.
- **Duplicar papel exige que o ator tenha todas as permissões do papel de
  origem** — comportamento intencional (seria uma forma de escalar
  indiretamente copiar um papel mais poderoso), mas significa que nem todo
  usuário com `roles:create` consegue duplicar qualquer papel.
- **`jwt()` callback consulta o banco a cada requisição autenticada** — custo
  aceitável no volume de um escritório pequeno; se o volume de requisições
  crescer muito, vale revisar (ex.: cache curto do resultado da checagem).

## Riscos remanescentes

- Sem 2FA, uma senha comprometida ainda dá acesso completo até ser trocada
  manualmente — mitigado por `mustChangePassword` forçado em toda
  criação/redefinição administrativa e pela revogação de sessão associada.
- `ip`/`userAgent` em `UserSession` vêm de headers HTTP, que podem ser
  forjados por um cliente malicioso antes de passar por um proxy confiável —
  aceitável como informação de apoio na auditoria, não como controle de
  segurança por si só.
