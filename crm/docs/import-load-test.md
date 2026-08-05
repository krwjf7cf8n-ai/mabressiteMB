# Teste de carga — Importação de CSV (G13, Marco 1.9 Sprint 5)

## Objetivo

Medir o tempo real de uma importação de CSV no maior tamanho oficialmente
suportado — `IMPORT_MAX_ROWS = 5.000` linhas (`packages/shared/src/import-limits.ts`)
— e decidir, com dados reais, se a arquitetura atual (execução síncrona,
em lotes, dentro da própria server action) continua adequada ou se precisa
mudar (fila/background job) antes de liberar importações grandes em produção.

Esta é uma medição, não um teste de regressão: não roda no `pnpm test`/CI
padrão. Rodar manualmente quando quiser reproduzir:

```bash
RUN_IMPORT_LOAD_TEST=1 pnpm --filter @mabres/web exec vitest run lib/import-load.test.ts
```

## Metodologia

O teste (`apps/web/lib/import-load.test.ts`) exercita, contra Postgres real,
exatamente os mesmos caminhos de código usados pelas server actions reais
(`uploadImportFileAction` → `detectDuplicatesAction` → `executeImportAction`),
só sem o wrapper de sessão HTTP/redirect:

1. Gera um CSV de 5.000 linhas em memória (nome, telefone, e-mail, cidade,
   estado, origem) — 250 delas com telefone que colide de propósito com 250
   contatos pré-existentes no banco, para exercitar a detecção de
   duplicidade contra dados reais, não só contra o próprio lote.
2. `validateAndParseUpload` — parse do arquivo bruto.
3. `buildContactImportLookups` + `validateContactRows` — validação de todas
   as 5.000 linhas.
4. `prisma.importJob.create` com as 5.000 `ImportRow` num único nested
   create.
5. `detectDuplicatesForJob` — compara as linhas válidas contra todos os
   contatos não-excluídos do banco.
6. Persiste o resultado da duplicidade (250 linhas) numa transação.
7. `executeImportJob` com a estratégia `CRIAR_SOMENTE_NOVOS` — cria os 4.750
   contatos novos em lotes de `IMPORT_BATCH_SIZE` (100, padrão), cada lote
   processado com `Promise.all` (já era assim antes desta sprint).

Cada fase é cronometrada individualmente (`performance.now()`). Ao final, o
teste confirma que o resultado está correto (`createdRows = 4750`,
`skippedRows = 250`, `failedRows = 0`, 4.750 `Contact` realmente criados) e
que o tempo total fica abaixo de um teto generoso (120s) — só para pegar uma
regressão catastrófica (ex.: virar O(n²) sem querer), não como o número
oficial do relatório.

## Resultados (3 execuções, máquina de desenvolvimento local)

| Fase | Execução 1 | Execução 2 | Execução 3 | Média |
|---|---:|---:|---:|---:|
| 1. Parse do arquivo | 42 ms | 43 ms | 100 ms | 62 ms |
| 2. Montar lookups (etapas/corretores) | 11 ms | 12 ms | 24 ms | 16 ms |
| 3. Validar as 5.000 linhas | 79 ms | 76 ms | 193 ms | 116 ms |
| 4. Criar ImportJob + 5.000 ImportRow | 4.947 ms | 2.377 ms | 3.678 ms | 3.667 ms |
| 5. Detectar duplicidade (vs. banco real) | 1.152 ms | 604 ms | 764 ms | 840 ms |
| 6. Persistir duplicidade (250 linhas) | 217 ms | 191 ms | 241 ms | 216 ms |
| 7. Executar importação (4.750 criações em lotes de 100) | 8.021 ms | 8.768 ms | 7.887 ms | 8.225 ms |
| **Total** | **~14,5 s** | **~12,1 s** | **~12,9 s** | **~13,1 s** |

(Ambiente: Postgres e Redis locais na mesma máquina do teste, sem latência
de rede real — números de produção contra um banco gerenciado remoto tendem
a ser piores, principalmente nas fases 4, 5 e 7, dominadas por round-trips
ao banco.)

## Conclusão

**Nenhuma mudança de arquitetura foi feita.** A execução ponta a ponta do
maior lote possível (5.000 linhas) completa em ~12-15 segundos, com
resultado correto (contagens batem, nenhuma falha) nas três execuções. O
processamento em lotes (`IMPORT_BATCH_SIZE = 100` + `Promise.all` por lote)
já existia antes desta sprint e é suficiente para esse volume — não havia
nenhum loop linha-a-linha não paralelizado na fase mais cara (execução).

**Risco identificado, não uma necessidade comprovada de mudar agora:** a
fase 7 (execução) sozinha já consome ~8s do total, e a fase 4 (criação do
ImportJob) mais ~3-5s — juntas, ~70-90% do tempo total. Isso é executado
dentro de uma única invocação de server action (`executeImportAction`), sem
nenhuma resposta parcial para o usuário até terminar. Em uma plataforma
serverless com timeout de função mais agressivo que o ambiente de
desenvolvimento local (ex.: 10s em alguns planos), uma importação de 5.000
linhas no pior caso (todas exigindo criação) poderia estourar o timeout da
plataforma de hospedagem escolhida para produção — isso depende
inteiramente de qual plataforma/plano for usado, algo que ainda não está
definido neste projeto.

Por instrução explícita do escopo desta sprint, isso **não foi tratado**
agora (nem fila, nem mudança de arquitetura) porque a medição não comprovou
necessidade — o pipeline atual funciona corretamente e dentro de um tempo
razoável no ambiente medido. Fica registrado aqui como item a revisitar
quando a plataforma de produção for definida, para confirmar se o timeout de
função dela comporta esses ~12-15s no pior caso, ou se nesse momento (com
dado concreto sobre a plataforma real) fará sentido mover a execução para o
worker (`apps/worker`, já usado para outros jobs assíncronos via BullMQ/Redis).
