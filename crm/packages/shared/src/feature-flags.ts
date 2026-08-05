/**
 * Feature flags de integrações externas. Todas nascem desligadas — nenhuma
 * chamada real a Meta/WhatsApp/Google/e-Móvel deve ocorrer enquanto a flag
 * correspondente estiver "false". Isso permite deixar a arquitetura (rotas,
 * schema, providers) pronta sem ativar nada em produção antes da hora.
 */
export interface FeatureFlags {
  metaLeadAds: boolean;
  whatsappCloudApi: boolean;
  googleOAuth: boolean;
  emovelIntegration: boolean;
}

function readBoolEnv(name: string): boolean {
  const raw = process.env[name];
  return raw === "true" || raw === "1";
}

export function getFeatureFlags(): FeatureFlags {
  return {
    metaLeadAds: readBoolEnv("FEATURE_META_LEAD_ADS"),
    whatsappCloudApi: readBoolEnv("FEATURE_WHATSAPP_CLOUD_API"),
    googleOAuth: readBoolEnv("FEATURE_GOOGLE_OAUTH"),
    emovelIntegration: readBoolEnv("FEATURE_EMOVEL_INTEGRATION"),
  };
}
