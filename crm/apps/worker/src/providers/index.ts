import { getFeatureFlags } from "@mabres/shared";
import { MockMetaLeadAdsProvider } from "./meta.mock";
import { MockWhatsAppProvider } from "./whatsapp.mock";
import { MockGoogleCalendarProvider, MockGmailProvider } from "./google.mock";
import { NotConfiguredEmovelProvider } from "./emovel.mock";

/**
 * Fábrica dos providers. Hoje todas as integrações retornam implementações
 * mock/reservadas — nenhuma chamada real acontece, independentemente da flag.
 * As flags existem para o painel de administração indicar claramente ao
 * usuário quais integrações estão "prontas para ativar" vs "não configuradas",
 * e para a troca por implementações reais nas fases seguintes não exigir
 * mudança de assinatura, apenas troca do `new Mock...()` por `new Real...()`.
 */
export function getProviderStatus() {
  const flags = getFeatureFlags();
  return {
    meta: flags.metaLeadAds ? "configurado_mock" : "desativado",
    whatsapp: flags.whatsappCloudApi ? "configurado_mock" : "desativado",
    google: flags.googleOAuth ? "configurado_mock" : "desativado",
    emovel: "aguardando_confirmacao_oficial",
  } as const;
}

export function getMetaProvider() {
  return new MockMetaLeadAdsProvider();
}

export function getWhatsAppProvider() {
  return new MockWhatsAppProvider();
}

export function getGoogleCalendarProvider() {
  return new MockGoogleCalendarProvider();
}

export function getGmailProvider() {
  return new MockGmailProvider();
}

export function getEmovelProvider() {
  return new NotConfiguredEmovelProvider();
}
