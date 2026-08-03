export interface DefaultStageSeed {
  name: string;
  order: number;
  requiresReasonOn: "NONE" | "LOSS" | "PAUSE";
}

/** Etapas iniciais do funil (configuráveis pelo administrador após o seed). */
export const DEFAULT_PIPELINE_STAGES: DefaultStageSeed[] = [
  { name: "Novo lead", order: 1, requiresReasonOn: "NONE" },
  { name: "Aguardando primeiro atendimento", order: 2, requiresReasonOn: "NONE" },
  { name: "Primeiro contato realizado", order: 3, requiresReasonOn: "NONE" },
  { name: "Conversa iniciada", order: 4, requiresReasonOn: "NONE" },
  { name: "Em qualificação", order: 5, requiresReasonOn: "NONE" },
  { name: "Lead qualificado", order: 6, requiresReasonOn: "NONE" },
  { name: "Análise de crédito", order: 7, requiresReasonOn: "NONE" },
  { name: "Crédito aprovado", order: 8, requiresReasonOn: "NONE" },
  { name: "Imóveis selecionados", order: 9, requiresReasonOn: "NONE" },
  { name: "Imóveis enviados", order: 10, requiresReasonOn: "NONE" },
  { name: "Visita a agendar", order: 11, requiresReasonOn: "NONE" },
  { name: "Visita agendada", order: 12, requiresReasonOn: "NONE" },
  { name: "Visita realizada", order: 13, requiresReasonOn: "NONE" },
  { name: "Proposta em elaboração", order: 14, requiresReasonOn: "NONE" },
  { name: "Proposta enviada", order: 15, requiresReasonOn: "NONE" },
  { name: "Negociação", order: 16, requiresReasonOn: "NONE" },
  { name: "Documentação", order: 17, requiresReasonOn: "NONE" },
  { name: "Financiamento", order: 18, requiresReasonOn: "NONE" },
  { name: "Contrato", order: 19, requiresReasonOn: "NONE" },
  { name: "Venda concluída", order: 20, requiresReasonOn: "NONE" },
  { name: "Pós-venda", order: 21, requiresReasonOn: "NONE" },
  { name: "Lead pausado", order: 22, requiresReasonOn: "PAUSE" },
  { name: "Lead perdido", order: 23, requiresReasonOn: "LOSS" },
  { name: "Lead sem resposta", order: 24, requiresReasonOn: "NONE" },
];
