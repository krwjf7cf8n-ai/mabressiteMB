# Motor de matching cliente ↔ imóvel (Fase 1.2)

Especificação formal do algoritmo implementado em
`packages/shared/src/matching.ts` (`computeMatch`). Usado identicamente nos
dois sentidos — cliente → imóveis (`getMatchesForContact`) e imóvel →
clientes (`getMatchesForProperty`), ambos em
`apps/web/lib/matching-service.ts`. **A regra de cálculo existe em um único
lugar**; a camada de serviço só busca dados e faz cache, a interface só exibe.

Versão atual do algoritmo: `1.0.0` (`MATCH_ALGORITHM_VERSION`).

## 1. Critérios avaliados

| Critério | Chave | Peso padrão | Nível padrão |
|---|---|---|---|
| Faixa de preço | `priceRange` | 20 | obrigatória |
| Cidade | `city` | 15 | obrigatória |
| Bairro | `neighborhood` | 10 | desejável |
| Tipo de imóvel | `propertyType` | 15 | obrigatória |
| Dormitórios | `bedrooms` | 10 | desejável |
| Suítes | `suites` | 5 | indiferente |
| Vagas | `parkingSpots` | 10 | desejável |
| Quintal | `backyard` | 3 | indiferente |
| Área gourmet | `gourmetArea` | 3 | indiferente |
| Casa térrea ou sobrado | `houseFormat` | 3 | indiferente |
| Condomínio ou bairro aberto | `condoOrOpen` | 2 | indiferente |
| Aceita financiamento | `acceptsFinancing` | 2 | indiferente |
| Aceita FGTS | `acceptsFgts` | 1 | indiferente |
| Aceita permuta | `acceptsTrade` | 1 | indiferente |

Pesos e níveis padrão são configuráveis por cliente (tela "Preferências e
critérios de matching" no detalhe do lead) — o corretor pode reclassificar
qualquer critério como obrigatória/desejável/indiferente. Pesos em si (os
números) não são editáveis pela interface nesta fase — só o **nível** de
exigência. Isso foi uma escolha deliberada para não criar uma interface
excessivamente complexa nesta entrega (ver seção "Limitações").

## 2. Exclusões estruturais (sempre aplicadas, independem de nível)

Antes de qualquer critério ser avaliado, o imóvel é descartado (`eligible =
false`) se:

- **Status ≠ "ativo"**: imóveis vendidos, alugados, suspensos, indisponíveis
  ou inativos nunca são recomendados.
- **Excluído por soft delete** (`deletedAt != null`): nunca chega a ser
  avaliado — filtrado na consulta antes mesmo de chamar `computeMatch`.
- **Finalidade incompatível com o interesse do cliente**:
  - `intent = null` (não informado) → não elegível, matching não se aplica.
  - `intent = VENDA` (cliente quer vender um imóvel, não comprar) → não
    elegível: matching de aquisição não se aplica a esse perfil.
  - `intent = LOCACAO` → exige `property.purpose ∈ {LOCACAO, AMBAS}`.
  - `intent ∈ {COMPRA, INVESTIMENTO}` → exige `property.purpose ∈ {VENDA,
    AMBAS}`.

## 3. Avaliação por critério

Para cada um dos 14 critérios, o motor calcula um de três estados:

- **`no_data`** (sem informação): o cliente não informou preferência para
  esse critério. Não conta a favor nem contra o score, e nunca é eliminatório
  — independente do nível de exigência configurado.
- **`met`** (atendido): o imóvel satisfaz a preferência informada.
- **`unmet`** (não atendido): o imóvel não satisfaz a preferência informada.

Critérios de "aceita X" (financiamento/FGTS/permuta) são um caso especial:
como não há um campo de preferência próprio do cliente para eles (o
corretor só marca o nível), eles só se tornam `applicable` quando o nível é
"obrigatória" ou "desejável" — com nível "indiferente" (padrão), ficam como
`no_data`.

## 4. Regra de eliminação

Um critério **elimina** o imóvel (`eliminatory = true`) quando:

```
nível == "obrigatória" AND applicable == true AND passed == false
```

Se qualquer critério for eliminatório, ou houver exclusão estrutural (seção
2), `eligible = false` e o resultado nunca aparece nas listas de
recomendação — mas continua sendo calculado, persistido e explicável (para a
tela poder dizer "não recomendado porque X").

## 5. Fórmula de pontuação

```
scorable = critérios onde applicable == true AND nível != "indiferente"
totalWeight = soma(peso) para todo critério em scorable
passedWeight = soma(peso) para todo critério em scorable onde passed == true

score = totalWeight == 0 ? 0 : round((passedWeight / totalWeight) * 100, 2 casas decimais)
```

- Critérios `indiferente` nunca entram no denominador nem no numerador —
  aparecem na explicação, mas não afetam a pontuação.
- Critérios `no_data` (sem informação) também ficam fora do denominador —
  por isso a ausência de preferência nunca reduz o score.
- Critérios obrigatórios que passaram entram normalmente no cálculo (não são
  tratados de forma diferente de um desejável que passou, a não ser pela
  eliminação em caso de falha).
- Arredondamento: `Math.round(x * 10000) / 100`, sempre 2 casas decimais,
  determinístico (sem ponto flutuante instável para os casos testados).

## 6. Faixas de classificação (tier)

| Score | Classificação |
|---|---|
| ≥ 90 | Excelente compatibilidade |
| ≥ 75 | Boa compatibilidade |
| ≥ 60 | Compatibilidade parcial |
| < 60 ou não elegível | Não recomendado |

Um resultado `eligible = true` ainda pode cair em "não recomendado" se o
score ficar abaixo de 60 (nenhum critério obrigatório falhou, mas a
qualidade geral é baixa) — a interface mostra esses casos com o filtro de
score mínimo, sem escondê-los.

## 7. Persistência e recálculo

- Cada par (cliente, imóvel) avaliado é gravado em `Match` com: `score`,
  `eligible`, `eliminationReasons`, `criteria` (estrutura completa por
  critério), `algorithmVersion` e `calculatedAt`.
- **Cache com invalidação automática**: antes de reusar um `Match`
  persistido, o serviço compara `calculatedAt` com `contact.updatedAt` e
  `property.updatedAt`, e com `MATCH_ALGORITHM_VERSION`
  (`isMatchStale`). Se qualquer um for mais recente que o cálculo salvo, ou a
  versão do algoritmo mudou, o resultado é recalculado antes de ser exibido
  — nunca mostra um resultado antigo como se fosse atual.
- **Botão "Recalcular"** força o recálculo imediato de todos os pares
  daquele cliente/imóvel, ignorando o cache.
- Toda alteração relevante em `Contact`/`ContactPreference`/`Property` já
  atualiza `updatedAt` automaticamente (Prisma `@updatedAt`), então basta
  visitar a tela novamente para ver o resultado atualizado — não é
  necessário um job de recálculo em lote.

### Por que essa estratégia, e não recálculo em lote

Com o volume inicial (dezenas de imóveis, 100–300 leads/mês), recalcular sob
demanda com cache é suficiente e mais simples que manter um job de
recálculo em background: evita recalcular a base inteira a cada alteração
pequena (ex.: mudar o telefone de um contato não deveria disparar
recálculo de 50 imóveis), e ainda garante que nada fica visivelmente
desatualizado, porque a checagem de staleness acontece exatamente no momento
de exibir o resultado.

## 8. Segurança e permissões

- `matches:view` — necessário para ver qualquer seção de compatibilidade.
- `matches:recalculate` — necessário para acionar o botão "Recalcular"
  (verificado no servidor, dentro da server action — não só escondido na
  UI).
- A seção "Clientes compatíveis" (visão a partir do imóvel) **nunca** busca
  ou exibe `ContactFinancialInfo` — o item de lista mostra apenas nome,
  cidade e temperatura do lead. Validado por teste E2E que varre o texto da
  seção em busca de vazamento de renda/FGTS aprovado/valor aprovado.

## 9. Limitações desta entrega

- Pesos numéricos por critério não são editáveis pela interface — só o nível
  (obrigatória/desejável/indiferente). Ajuste de peso fica para uma fase
  futura, se houver demanda real.
- Não há recálculo em lote agendado — depende de alguém visitar a tela do
  cliente/imóvel (aceitável no volume atual; se o volume crescer muito,
  considerar um job periódico no worker).
- `ContactPreference.criteriaRequirements` é um campo `Json` livre — não há
  validação de schema além do enum de valores (`obrigatoria`/`desejavel`/
  `indiferente`) por chave.
- Nenhum uso de IA nesta fase — 100% determinístico e baseado em regras
  explícitas, como exigido.

## 10. Impacto de performance

Cada visita à tela de matching de um cliente avalia todos os imóveis ativos
(hoje, algumas dezenas); cada visita à tela de um imóvel avalia todos os
contatos com preferências cadastradas. Ambas as consultas são O(imóveis
ativos) / O(contatos com preferência), com uma query indexada por `Match` para
reaproveitar cálculos não obsoletos. Para o volume alvo (100–300 leads/mês,
dezenas de imóveis), isso é imperceptível. Se o catálogo de imóveis crescer
para milhares, valerá revisar para paginação e/ou pré-cálculo assíncrono.
