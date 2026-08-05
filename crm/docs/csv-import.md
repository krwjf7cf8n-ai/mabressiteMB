# Importação CSV de leads e clientes (Fase 1.4)

## Escopo

Só leads/clientes (`Contact` + `ContactPreference` + `ContactFinancialInfo`).
Imóveis, proprietários, visitas, tarefas, propostas, documentos, usuários e
comissões **não** são importados nesta fase — o modelo de dados (`ImportJob.type`)
está preparado para outros tipos (`ImportType` hoje só tem `CONTACTS`), mas o
fluxo funcional é restrito.

## Fluxo

1. **Upload** (`/imports/new`) — envia o CSV. Validação de arquivo roda antes
   de qualquer persistência (ver "Segurança do arquivo" abaixo). Se passar,
   cria um `ImportJob` (`status = RASCUNHO`) e um `ImportRow` por linha, com
   mapeamento de colunas sugerido automaticamente e validação de campo já
   aplicada.
2. **Pré-visualização e mapeamento** (`/imports/[id]`) — mostra tamanho,
   nº de linhas, delimitador, encoding, linhas malformadas, as primeiras
   linhas, e um seletor por coluna do CSV para o campo de destino. Ajustar o
   mapeamento revalida todas as linhas (`updateMappingAction`). Duas colunas
   apontando para o mesmo campo exigem confirmação explícita.
3. **Detecção de duplicidade** (`detectDuplicatesAction`) — reaproveita
   `findDuplicateMatches` (o mesmo mecanismo do cadastro manual de lead,
   `packages/shared/src/dedup.ts`): telefone, WhatsApp, e-mail ou
   `metaLeadId`. Nomes iguais sozinhos não contam.
4. **Estratégia + execução** (`executeImportAction`) — estratégia global
   (`CRIAR_SOMENTE_NOVOS` | `CRIAR_E_COMPLETAR` | `CRIAR_E_ATUALIZAR` |
   `IGNORAR_DUPLICADOS`) mais um ajuste opcional por linha duplicada
   (ignorar / atualizar / criar mesmo assim com justificativa). Antes de
   processar, a detecção de duplicidade roda de novo como rede de segurança
   — mesmo que ninguém tenha clicado em "Detectar duplicidades", uma linha
   nunca vira um contato novo sem essa checagem.
5. **Resultado** — contagem de criados/atualizados/ignorados/falhas.
6. **Rollback** (opcional, `rollbackImportAction`) — ver seção própria.

Nenhum registro é criado antes do passo 4.

## Segurança do arquivo

`apps/web/lib/import-service.ts` (`validateAndParseUpload`), nessa ordem:

1. Extensão `.csv` obrigatória.
2. MIME declarado pelo navegador precisa estar numa lista de aceitos
   (`text/csv`, `text/plain`, `application/vnd.ms-excel`, `application/csv`)
   — **não é a única checagem**: o conteúdo é decodificado e testado contra
   `looksLikeBinaryContent` (bytes nulos / excesso de caracteres de controle),
   então um arquivo binário renomeado para `.csv` com MIME forjado ainda é
   rejeitado.
3. Tamanho, nº de linhas, nº de colunas e tamanho de cada campo comparados
   contra `IMPORT_MAX_FILE_SIZE_BYTES` / `IMPORT_MAX_ROWS` /
   `IMPORT_MAX_COLUMNS` / `IMPORT_MAX_FIELD_LENGTH` (todos configuráveis via
   `.env`, valores padrão em `packages/shared/src/import-limits.ts`).
4. Parser CSV escrito à mão (`packages/shared/src/csv.ts`, RFC4180 básico —
   aspas, aspas escapadas, campos multi-linha, vírgula ou ponto e vírgula) —
   nunca `eval`, nunca interpreta o conteúdo como código.
5. Nenhum conteúdo do arquivo é executado. XLSX não é aceito nesta fase.

**CSV/formula injection**: `sanitizeCsvField`/`toCsv` (mesmo módulo)
neutralizam valores que começam com `= + - @` (ou tab/CR) prefixando com uma
aspa simples — usado sempre que o sistema gera um CSV de volta (ex.: relatório
de erros), para que abrir o resultado no Excel/Sheets não execute uma fórmula
vinda de um dado do usuário.

## Normalização (`packages/shared/src/import-normalize.ts`)

Telefone/WhatsApp → E.164 (`+55DDDNÚMERO`). E-mail → minúsculo/trim (reusa
`dedup.ts`). Datas aceitam `dd/mm/yyyy`, `yyyy-mm-dd` e ISO 8601 completo —
sem horário, são interpretadas como meia-noite em `America/Sao_Paulo` e
convertidas para UTC no armazenamento; nunca aritmética de fuso local.
Valores monetários aceitam `450.000,00`, `R$ 450.000` e `450000`.

## Mapeamento

`packages/shared/src/import-contacts.ts` — catálogo de campos de destino
(`IMPORT_CONTACT_FIELDS`) com grupo (`contact` / `preference` / `financial`)
e sensibilidade. `suggestColumnMapping` casa cabeçalhos por texto normalizado
(sem acento/case) contra uma lista de sinônimos por campo.
`findMappingConflicts` detecta duas colunas de origem apontando pro mesmo
campo — a UI bloqueia a revalidação até o usuário marcar "confirmar mesmo
assim". Não existe "salvar modelo de mapeamento" nesta fase (preparado, não
implementado — cada importação remapeia do zero).

**CPF não é importável**: `Contact` não tem campo CPF no schema atual: não foi
adicionado um campo novo fora do que a fase pedia. Fica como limitação
conhecida.

## Validação

`validateAndNormalizeContactRow` classifica cada linha nos status do enum
`ImportRowValidationStatus`: `VALIDA`, `VALIDA_COM_AVISO`, `INVALIDA`,
`DUPLICADA` (a quinta, `CONFLITO_ATUALIZACAO`, está reservada mas não é usada
nesta fase — duplicidade ambígua, ver abaixo, vira `ERRO` na execução em vez
disso). Nome é o único campo obrigatório; a linha também precisa de telefone,
WhatsApp ou e-mail (pelo menos um canal de contato). Etapa do funil e corretor
responsável são resolvidos por nome/e-mail contra o banco — se não encontrados,
a linha fica `INVALIDA` com o erro específico. Nunca inventa dado para campo
ausente/não mapeado. A tela mostra até 50 linhas inválidas por vez; o relatório
completo pode ser baixado em CSV (`/imports/[id]/errors`, `imports:view`),
protegido contra formula injection pelo mesmo `sanitizeCsvField`.

## Duplicidade e estratégias

| Estratégia | Linha nova | Linha duplicada (padrão) |
|---|---|---|
| `CRIAR_SOMENTE_NOVOS` | cria | ignora |
| `CRIAR_E_COMPLETAR` | cria | atualiza só campos vazios do registro existente |
| `CRIAR_E_ATUALIZAR` | cria | atualiza, sobrescrevendo com o valor do CSV |
| `IGNORAR_DUPLICADOS` | cria | ignora |

`imports:update_existing` é exigida para escolher `CRIAR_E_COMPLETAR`/
`CRIAR_E_ATUALIZAR` (a estratégia some do seletor sem a permissão, e o
servidor rechecha). Um ajuste manual por linha pode forçar "criar mesmo assim"
(duplicado) — exige `imports:create_duplicate` **e** uma justificativa de
texto, gravada como nota na própria linha.

**Nunca apaga por célula vazia**: uma coluna do CSV vazia nunca limpa um valor
já existente no contato, em nenhuma estratégia.

**Nunca troca responsável/etapa silenciosamente**: `ownerUserId` e `stageId`
do contato existente nunca são alterados por uma atualização de importação
(`computeContactUpdateDiff`), mesmo com `CRIAR_E_ATUALIZAR` e mesmo que o CSV
tenha uma coluna mapeada para "Corretor responsável"/"Etapa do funil" — esses
dois campos só são usados ao **criar** um contato novo.

**Duplicidade ambígua** (a linha bate com mais de um contato existente
distinto): não é resolvida automaticamente — vira `ERRO` na execução,
contabilizada em `failedRows`, com uma mensagem explícita pedindo análise
manual.

## Execução e idempotência

`executeImportJob` processa em lotes (`IMPORT_BATCH_SIZE`, padrão 100) —
nunca uma transação só para o arquivo inteiro. Cada linha roda na sua própria
transação (criação/atualização do Contact + preferência + dado financeiro +
o registro da própria `ImportRow`); uma falha isolada não derruba o lote.

Idempotência em duas camadas:
- **Nível do job**: só pode ser executado uma vez (`status` precisa ser
  `RASCUNHO`; depois de `PROCESSANDO`/`CONCLUIDO`/etc. a ação rejeita).
- **Nível do arquivo**: hash SHA-256 do conteúdo (`ImportJob.fileHash`) — se o
  mesmo arquivo já foi importado com um job concluído/em processamento, o
  upload segue normalmente mas mostra um aviso explícito.

O arquivo original **nunca é persistido** — só o hash e os dados por linha.
Ver "Privacidade e retenção" abaixo.

## Auditoria

Toda criação/atualização de `Contact` originada de importação grava
`AuditLog` (`import_create`, `import_create_duplicate`, `import_update`,
`import_rollback_create`, `import_rollback_update`) com `importJobId` no
payload — dá pra rastrear qualquer lead até a importação de origem sem
precisar de uma coluna redundante em `Contact`. O próprio `ImportJob` também
audita `upload`, `remap`, `detect_duplicates`, `execute` e `rollback`.

## Rollback

Só reverte o que é seguro reverter:

- **Criação** (`CRIAR`/`CRIAR_DUPLICADO`) → soft delete do `Contact`
  (`deletedAt`), nunca exclusão física — consistente com o resto do sistema.
- **Atualização** (`ATUALIZAR`) → restaura os campos capturados em
  `ImportRow.preUpdateSnapshot` (só os campos que a importação realmente
  tocou).
- **Ignoradas/falhas** → nada a reverter.

Antes de reverter uma linha, compara `Contact.updatedAt` atual com
`ImportRow.postExecutionUpdatedAt` (o valor logo depois da importação
escrever nele). Se mudou — alguém editou manualmente depois — o rollback
automático **daquela linha** é bloqueado (`rollbackBlockedReason`) e o job
termina como `DESFEITO_PARCIAL`, não `DESFEITO`; o restante segue revertido
normalmente. Exige `imports:rollback` + justificativa obrigatória + confirma
via clique + gera auditoria (`rollback`, com contagem de revertidos/bloqueados).
Não existe "rollback total ingênuo" — nunca apaga por uma lista de IDs sem
essa checagem de concorrência por linha.

## Permissões

| Permissão | Uso |
|---|---|
| `imports:view` | ver lista e detalhe de importações |
| `imports:create` | upload, mapeamento, revalidação, detecção de duplicidade |
| `imports:execute` | executar (confirmar) uma importação validada |
| `imports:update_existing` | usar estratégia que atualiza registros existentes |
| `imports:create_duplicate` | criar um novo registro mesmo com duplicidade apontada |
| `imports:rollback` | desfazer uma importação já executada |
| `imports:view_sensitive_data` | ver renda/entrada/FGTS na pré-visualização (mascarados sem ela) |

Aplicadas no servidor (`requirePermission`) em toda ação — nunca só
escondendo botão na UI (a UI também esconde, mas isso é conveniência, não a
proteção real).

## Privacidade e retenção

Sem multi-tenant nesta fase (CRM de um único escritório) — "isolamento" é por
usuário/permissão, não por organização. O arquivo bruto nunca é armazenado em
disco/objeto — só processado em memória durante a requisição. `ImportRow.originalData`
(cópia por linha, inclui os valores brutos do CSV) tem um período de retenção
configurável (`IMPORT_ROW_DATA_RETENTION_DAYS`, padrão 90 dias); a purga
automática desses dados após o prazo **não está implementada nesta fase** —
listada como débito técnico abaixo. Dados sensíveis (renda/entrada/FGTS) na
pré-visualização são mascarados (`•••••`) para quem não tem
`imports:view_sensitive_data`.

## Limitações conhecidas / débitos técnicos

- **Purga automática por retenção não implementada**: `IMPORT_ROW_DATA_RETENTION_DAYS`
  existe e é lido, mas nenhum job do worker ainda apaga `ImportRow.originalData`
  vencido — hoje é um valor documentado, não aplicado. Candidato a um job do
  `apps/worker` na mesma linha de `check-overdue-tasks`.
- **XLSX não suportado** — só CSV UTF-8 (com ou sem BOM), vírgula ou ponto e
  vírgula.
- **Processamento síncrono**: a execução roda dentro da própria requisição do
  servidor (viável no volume de um escritório pequeno, até `IMPORT_MAX_ROWS`).
  Preparado para mover para o worker quando o volume justificar, não
  implementado.
- **Sem "salvar modelo de mapeamento"**: cada importação remapeia do zero.
- **Sem CPF**: `Contact` não tem esse campo; fora do escopo desta fase.
- **Duplicidade ambígua (mais de um candidato) não tem resolução assistida na
  UI** além de virar erro — o usuário precisa tratar manualmente fora do
  fluxo de importação.
