import type { EmovelProvider } from "./types";

/**
 * Nenhuma API oficial do e-Móvel Brokers foi confirmada até o momento.
 * Esta implementação existe apenas para satisfazer a interface `EmovelProvider`
 * e deixar o restante do sistema (rotas, schema `Property.externalRef`,
 * `syncStatus`) pronto para plugar a integração real assim que o suporte do
 * e-Móvel confirmar API REST, webhooks e/ou schema de XML por escrito.
 * Todo método lança erro explícito — não simula sucesso nem faz scraping.
 */
export class NotConfiguredEmovelProvider implements EmovelProvider {
  private fail(method: string): never {
    throw new Error(
      `[EmovelProvider] "${method}" não implementado: API oficial do e-Móvel Brokers ainda não ` +
        `confirmada. Ver docs/integration-plan.md — seção e-Móvel Brokers.`,
    );
  }

  async createProperty(): Promise<{ externalId: string }> {
    this.fail("createProperty");
  }

  async updateProperty(): Promise<void> {
    this.fail("updateProperty");
  }

  async updatePrice(): Promise<void> {
    this.fail("updatePrice");
  }

  async updateAvailability(): Promise<void> {
    this.fail("updateAvailability");
  }

  async inactivateProperty(): Promise<void> {
    this.fail("inactivateProperty");
  }

  async getSyncStatus(): Promise<{ status: string; lastSyncedAt: Date | null }> {
    return { status: "integracao_nao_configurada", lastSyncedAt: null };
  }
}
