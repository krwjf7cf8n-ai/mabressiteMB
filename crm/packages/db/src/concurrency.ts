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
