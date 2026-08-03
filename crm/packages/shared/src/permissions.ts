/**
 * Catálogo de permissões do CRM. RBAC é configurável em runtime (tabelas
 * Role/Permission/RolePermission) — esta lista é o catálogo de permissões
 * conhecidas pelo sistema, usada para popular o seed inicial e para
 * autocompletar a tela de configuração de papéis do administrador.
 */
export const PERMISSIONS = [
  { key: "users:manage", description: "Gerenciar usuários" },
  { key: "roles:manage", description: "Gerenciar papéis e permissões" },
  { key: "settings:manage", description: "Gerenciar configurações do sistema" },
  { key: "integrations:manage", description: "Gerenciar integrações externas" },
  { key: "audit:view", description: "Consultar trilha de auditoria" },

  { key: "contacts:view_all", description: "Ver leads/clientes de toda a equipe" },
  { key: "contacts:view_own", description: "Ver apenas os próprios leads/clientes" },
  { key: "contacts:create", description: "Cadastrar leads/clientes" },
  { key: "contacts:update", description: "Atualizar leads/clientes" },
  { key: "contacts:delete", description: "Excluir (soft delete) leads/clientes" },
  { key: "contacts:export", description: "Exportar dados de leads/clientes" },
  { key: "contacts:view_financial", description: "Ver dados financeiros restritos do cliente" },
  { key: "contacts:update_financial", description: "Atualizar dados financeiros restritos do cliente" },
  { key: "contacts:reassign", description: "Reatribuir corretor responsável" },

  { key: "properties:view", description: "Ver imóveis" },
  { key: "properties:create", description: "Cadastrar imóveis" },
  { key: "properties:update", description: "Atualizar imóveis" },
  { key: "properties:delete", description: "Excluir (soft delete) imóveis" },

  { key: "owners:view", description: "Ver proprietários" },
  { key: "owners:create", description: "Cadastrar proprietários" },
  { key: "owners:update", description: "Atualizar proprietários" },
  { key: "owners:delete", description: "Excluir (soft delete) proprietários" },

  { key: "matches:view", description: "Ver compatibilidade entre clientes e imóveis" },
  { key: "matches:recalculate", description: "Forçar recálculo de compatibilidade" },

  { key: "visits:view", description: "Ver visitas" },
  { key: "visits:create", description: "Agendar visitas" },
  { key: "visits:update", description: "Atualizar visitas" },

  { key: "tasks:view", description: "Ver tarefas" },
  { key: "tasks:create", description: "Criar tarefas" },
  { key: "tasks:update", description: "Atualizar tarefas" },

  { key: "proposals:view", description: "Ver propostas" },
  { key: "proposals:create", description: "Criar propostas" },
  { key: "proposals:update", description: "Atualizar propostas" },

  { key: "contracts:view", description: "Ver contratos" },
  { key: "contracts:manage", description: "Gerenciar contratos" },

  { key: "commissions:view", description: "Ver comissões" },
  { key: "commissions:manage", description: "Gerenciar comissões" },

  { key: "automations:manage", description: "Gerenciar automações" },

  { key: "reports:view", description: "Ver relatórios operacionais" },
  { key: "reports:view_financial", description: "Ver relatórios financeiros" },

  { key: "import:manage", description: "Importar dados (CSV)" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

/** Papéis-base sugeridos no seed. Totalmente editável depois pelo administrador. */
export const SYSTEM_ROLE_DEFAULTS: Record<string, PermissionKey[] | "*"> = {
  Administrador: "*",
  Gestor: [
    "contacts:view_all",
    "contacts:create",
    "contacts:update",
    "contacts:reassign",
    "properties:view",
    "properties:update",
    "owners:view",
    "matches:view",
    "matches:recalculate",
    "visits:view",
    "visits:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "proposals:view",
    "reports:view",
    "automations:manage",
  ],
  Corretor: [
    "contacts:view_own",
    "contacts:create",
    "contacts:update",
    "contacts:view_financial",
    "properties:view",
    "properties:create",
    "properties:update",
    "owners:view",
    "owners:create",
    "matches:view",
    "matches:recalculate",
    "visits:view",
    "visits:create",
    "visits:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "proposals:view",
    "proposals:create",
    "proposals:update",
    "reports:view",
  ],
  Assistente: [
    "contacts:view_all",
    "contacts:create",
    "properties:view",
    "properties:update",
    "matches:view",
    "visits:view",
    "visits:create",
    "tasks:view",
    "tasks:create",
    "tasks:update",
  ],
};

export function resolveRolePermissions(role: keyof typeof SYSTEM_ROLE_DEFAULTS): PermissionKey[] {
  const value = SYSTEM_ROLE_DEFAULTS[role];
  if (value === "*") return PERMISSIONS.map((p) => p.key);
  return value ?? [];
}
