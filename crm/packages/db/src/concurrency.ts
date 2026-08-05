/**
 * Lançado quando uma atualização otimista (updateMany filtrado por
 * `updatedAt` esperado) afeta 0 linhas — outra requisição alterou o registro
 * entre a leitura e a escrita. O chamador deve pedir para recarregar a
 * página em vez de sobrescrever silenciosamente.
 */
export class ConcurrencyConflictError extends Error {
  constructor(entity: string) {
    super(`${entity} foi alterado por outra pessoa nesse meio tempo. Recarregue a página e tente novamente.`);
    this.name = "ConcurrencyConflictError";
  }
}

interface OptimisticUpdateDelegate<TData> {
  updateMany(args: { where: { id: string; updatedAt: Date }; data: TData }): Promise<{ count: number }>;
}

/**
 * Atualização otimista genérica: só aplica `data` se `updatedAt` no banco
 * ainda for igual a `expectedUpdatedAt` (o valor lido pela tela). Se outra
 * requisição já alterou o registro nesse meio tempo, `count` vem 0 e lança
 * `ConcurrencyConflictError(entityLabel)` — nunca sobrescreve silenciosamente.
 *
 * Uso: `await updateOptimistically(tx.visit, id, expectedUpdatedAt, data, "Esta visita")`.
 */
export async function updateOptimistically<TData>(
  delegate: OptimisticUpdateDelegate<TData>,
  id: string,
  expectedUpdatedAt: Date,
  data: TData,
  entityLabel: string,
): Promise<void> {
  const result = await delegate.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data });
  if (result.count === 0) {
    throw new ConcurrencyConflictError(entityLabel);
  }
}
