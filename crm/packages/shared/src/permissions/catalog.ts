/**
 * Catálogo de permissões do CRM. RBAC é configurável em runtime (tabelas
 * Role/Permission/RolePermission) — esta lista é o catálogo de permissões
 * conhecidas pelo sistema, usada para popular o seed inicial e para
 * alimentar a tela de administração de papéis (agrupada por domínio, com
 * nível de risco visível ao lado de cada uma).
 */
export type PermissionDomain =
  | "usuarios"
  | "papeis"
  | "auditoria"
  | "configuracoes"
  | "integracoes"
  | "leads"
  | "imoveis"
  | "proprietarios"
  | "matching"
  | "visitas"
  | "tarefas"
  | "propostas"
  | "financeiro"
  | "automacoes"
  | "relatorios"
  | "importacoes";

export type PermissionRisk = "baixo" | "medio" | "alto" | "critico";

export interface PermissionDefinition {
  key: string;
  description: string;
  domain: PermissionDomain;
  risk: PermissionRisk;
}

export const PERMISSION_DOMAIN_LABELS: Record<PermissionDomain, string> = {
  usuarios: "Usuários",
  papeis: "Papéis e permissões",
  auditoria: "Auditoria",
  configuracoes: "Configurações",
  integracoes: "Integrações",
  leads: "Leads e clientes",
  imoveis: "Imóveis",
  proprietarios: "Proprietários",
  matching: "Compatibilidade (matching)",
  visitas: "Visitas",
  tarefas: "Tarefas",
  propostas: "Propostas e contratos",
  financeiro: "Financeiro",
  automacoes: "Automações",
  relatorios: "Relatórios",
  importacoes: "Importações",
};

export const PERMISSIONS = [
  // Usuários (Fase 1.5) — todas críticas ou de alto risco: afetam quem acessa o sistema.
  { key: "users:view", description: "Ver usuários", domain: "usuarios", risk: "alto" },
  { key: "users:create", description: "Criar usuários", domain: "usuarios", risk: "critico" },
  { key: "users:update", description: "Editar dados básicos de usuários", domain: "usuarios", risk: "alto" },
  { key: "users:disable", description: "Desativar usuários", domain: "usuarios", risk: "critico" },
  { key: "users:reactivate", description: "Reativar usuários desativados", domain: "usuarios", risk: "critico" },
  { key: "users:reset_password", description: "Redefinir senha de outro usuário", domain: "usuarios", risk: "critico" },
  { key: "users:terminate_sessions", description: "Encerrar sessões de um usuário", domain: "usuarios", risk: "alto" },
  { key: "users:reassign_records", description: "Reatribuir leads/tarefas/visitas/imóveis de um usuário para outro", domain: "usuarios", risk: "critico" },

  // Papéis e permissões (Fase 1.5)
  { key: "roles:view", description: "Ver papéis e suas permissões", domain: "papeis", risk: "alto" },
  { key: "roles:create", description: "Criar papel personalizado", domain: "papeis", risk: "critico" },
  { key: "roles:update", description: "Editar permissões de um papel", domain: "papeis", risk: "critico" },
  { key: "roles:disable", description: "Desativar papel personalizado", domain: "papeis", risk: "alto" },
  { key: "roles:assign", description: "Atribuir papel a um usuário", domain: "papeis", risk: "critico" },
  { key: "permissions:view", description: "Ver catálogo de permissões", domain: "papeis", risk: "baixo" },
  { key: "permissions:assign", description: "Atribuir permissões a um papel", domain: "papeis", risk: "critico" },

  { key: "audit:view", description: "Consultar trilha de auditoria", domain: "auditoria", risk: "alto" },
  { key: "settings:manage", description: "Gerenciar configurações do sistema", domain: "configuracoes", risk: "critico" },
  { key: "integrations:manage", description: "Gerenciar integrações externas", domain: "integracoes", risk: "critico" },

  { key: "contacts:view_all", description: "Ver leads/clientes de toda a equipe", domain: "leads", risk: "medio" },
  { key: "contacts:view_own", description: "Ver apenas os próprios leads/clientes", domain: "leads", risk: "baixo" },
  { key: "contacts:create", description: "Cadastrar leads/clientes", domain: "leads", risk: "baixo" },
  { key: "contacts:update", description: "Atualizar leads/clientes", domain: "leads", risk: "baixo" },
  { key: "contacts:delete", description: "Excluir (soft delete) leads/clientes", domain: "leads", risk: "alto" },
  { key: "contacts:export", description: "Exportar dados de leads/clientes", domain: "leads", risk: "alto" },
  { key: "contacts:view_financial", description: "Ver dados financeiros restritos do cliente", domain: "leads", risk: "alto" },
  { key: "contacts:update_financial", description: "Atualizar dados financeiros restritos do cliente", domain: "leads", risk: "alto" },
  { key: "contacts:reassign", description: "Reatribuir corretor responsável", domain: "leads", risk: "medio" },

  { key: "properties:view", description: "Ver imóveis", domain: "imoveis", risk: "baixo" },
  { key: "properties:create", description: "Cadastrar imóveis", domain: "imoveis", risk: "baixo" },
  { key: "properties:update", description: "Atualizar imóveis", domain: "imoveis", risk: "medio" },
  { key: "properties:delete", description: "Excluir (soft delete) imóveis", domain: "imoveis", risk: "alto" },

  { key: "owners:view", description: "Ver proprietários", domain: "proprietarios", risk: "baixo" },
  { key: "owners:create", description: "Cadastrar proprietários", domain: "proprietarios", risk: "baixo" },
  { key: "owners:update", description: "Atualizar proprietários", domain: "proprietarios", risk: "medio" },
  { key: "owners:delete", description: "Excluir (soft delete) proprietários", domain: "proprietarios", risk: "alto" },

  { key: "matches:view", description: "Ver compatibilidade entre clientes e imóveis", domain: "matching", risk: "baixo" },
  { key: "matches:recalculate", description: "Forçar recálculo de compatibilidade", domain: "matching", risk: "baixo" },

  { key: "visits:view", description: "Ver as próprias visitas", domain: "visitas", risk: "baixo" },
  { key: "visits:view_all", description: "Ver visitas de toda a equipe", domain: "visitas", risk: "medio" },
  { key: "visits:create", description: "Agendar visitas", domain: "visitas", risk: "baixo" },
  { key: "visits:update", description: "Atualizar visitas (reagendar, confirmar, registrar resultado)", domain: "visitas", risk: "baixo" },
  { key: "visits:cancel", description: "Cancelar visitas", domain: "visitas", risk: "medio" },
  { key: "visits:reassign", description: "Reatribuir corretor responsável pela visita", domain: "visitas", risk: "medio" },
  { key: "visits:override_conflict", description: "Confirmar visita mesmo com conflito de agenda ou imóvel inativo", domain: "visitas", risk: "alto" },

  { key: "tasks:view", description: "Ver as próprias tarefas", domain: "tarefas", risk: "baixo" },
  { key: "tasks:view_all", description: "Ver tarefas de toda a equipe", domain: "tarefas", risk: "medio" },
  { key: "tasks:create", description: "Criar tarefas", domain: "tarefas", risk: "baixo" },
  { key: "tasks:update", description: "Atualizar tarefas", domain: "tarefas", risk: "baixo" },
  { key: "tasks:complete", description: "Concluir tarefas", domain: "tarefas", risk: "baixo" },
  { key: "tasks:cancel", description: "Cancelar tarefas", domain: "tarefas", risk: "baixo" },
  { key: "tasks:reassign", description: "Reatribuir responsável pela tarefa", domain: "tarefas", risk: "medio" },

  { key: "proposals:view", description: "Ver propostas", domain: "propostas", risk: "baixo" },
  { key: "proposals:create", description: "Criar propostas", domain: "propostas", risk: "medio" },
  { key: "proposals:update", description: "Atualizar propostas", domain: "propostas", risk: "medio" },
  { key: "contracts:view", description: "Ver contratos", domain: "propostas", risk: "medio" },
  { key: "contracts:manage", description: "Gerenciar contratos", domain: "propostas", risk: "critico" },

  { key: "commissions:view", description: "Ver comissões", domain: "financeiro", risk: "medio" },
  { key: "commissions:manage", description: "Gerenciar comissões", domain: "financeiro", risk: "critico" },
  { key: "reports:view", description: "Ver relatórios operacionais", domain: "relatorios", risk: "baixo" },
  { key: "reports:view_financial", description: "Ver relatórios financeiros", domain: "relatorios", risk: "alto" },

  { key: "automations:manage", description: "Gerenciar automações", domain: "automacoes", risk: "critico" },

  { key: "imports:view", description: "Ver importações (histórico, pré-visualização, resultado)", domain: "importacoes", risk: "baixo" },
  { key: "imports:create", description: "Iniciar uma importação (upload, mapeamento, validação)", domain: "importacoes", risk: "medio" },
  { key: "imports:execute", description: "Executar (confirmar) uma importação já validada", domain: "importacoes", risk: "alto" },
  { key: "imports:update_existing", description: "Usar estratégia de importação que atualiza registros existentes", domain: "importacoes", risk: "alto" },
  { key: "imports:create_duplicate", description: "Criar um novo registro mesmo quando o importador aponta duplicidade", domain: "importacoes", risk: "alto" },
  { key: "imports:rollback", description: "Desfazer (rollback) uma importação já executada", domain: "importacoes", risk: "critico" },
  { key: "imports:view_sensitive_data", description: "Ver renda/entrada/FGTS na pré-visualização da importação", domain: "importacoes", risk: "alto" },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export function getPermissionDefinition(key: string): PermissionDefinition | undefined {
  return PERMISSIONS.find((p) => p.key === key);
}
