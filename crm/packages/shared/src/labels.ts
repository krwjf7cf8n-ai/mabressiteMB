/**
 * G31 (Marco 1.9, Sprint 6) — rótulos em PT-BR para os enums que antes eram
 * exibidos crus na interface (ex.: "AGUARDANDO_CONFIRMACAO" em vez de
 * "Aguardando confirmação"). Centralizado aqui para não duplicar o mapeamento
 * em cada página que precisa exibir um desses valores.
 */

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  CONFIRMADA: "Confirmada",
  REAGENDADA: "Reagendada",
  REALIZADA: "Realizada",
  CANCELADA_CLIENTE: "Cancelada pelo cliente",
  CANCELADA_CORRETOR: "Cancelada pelo corretor",
  CLIENTE_NAO_COMPARECEU: "Cliente não compareceu",
  PROPRIETARIO_INDISPONIVEL: "Proprietário indisponível",
};

export const TASK_ORIGIN_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  VISITA: "Gerada por visita",
  AUTOMACAO: "Automação",
  INTEGRACAO: "Integração",
};

export const VISIT_MODALITY_LABELS: Record<string, string> = {
  PRESENCIAL: "Presencial",
  VIDEO: "Videochamada",
};

export const VISIT_ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual",
  automacao: "Automação",
  integracao: "Integração",
};

export const CONTACT_ORIGIN_LABELS: Record<string, string> = {
  META_LEAD_ADS: "Anúncio (Meta)",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  MANUAL: "Cadastro manual",
  IMPORTACAO: "Importação de planilha",
  INDICACAO: "Indicação",
  OUTRO: "Outro",
};

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  alugado: "Alugado",
  suspenso: "Suspenso",
  indisponivel: "Indisponível",
  inativo: "Inativo",
};
