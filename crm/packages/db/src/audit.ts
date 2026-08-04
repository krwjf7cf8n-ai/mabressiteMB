import type { ActorType, Prisma, PrismaClient } from "@prisma/client";

export interface RecordAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorType?: ActorType;
  actorUserId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

const REDACTED = "[REDACTED]";

/**
 * G18 (Marco 1.9) — nomes de campo (case-insensitive, substring) que nunca
 * devem aparecer em texto no AuditLog: senha/token/segredo, documento
 * completo (ex.: CPF/CNPJ do proprietário) e dados bancários — as mesmas
 * quatro categorias já documentadas em docs/security-plan.md.
 */
const SENSITIVE_FIELD_PATTERN = /password|senha|token|secret|segredo|bankdata|documento|document/i;

/**
 * Percorre recursivamente `value` e substitui por `"[REDACTED]"` qualquer
 * campo cujo nome bata com `SENSITIVE_FIELD_PATTERN` — rede de segurança
 * automática para além da disciplina manual de cada call site (que continua
 * sendo a primeira linha de defesa: nunca passe o objeto inteiro de um
 * registro sensível para `before`/`after`, passe só os campos relevantes).
 */
export function redactSensitiveFields<T extends Prisma.InputJsonValue | null | undefined>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item)) as unknown as T;
  }

  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, fieldValue] of Object.entries(value as Record<string, Prisma.InputJsonValue>)) {
    result[key] = SENSITIVE_FIELD_PATTERN.test(key)
      ? REDACTED
      : (redactSensitiveFields(fieldValue) as Prisma.InputJsonValue);
  }
  return result as T;
}

/**
 * Registra uma entrada de auditoria. `before`/`after` passam automaticamente
 * por `redactSensitiveFields` — mas isso é uma rede de segurança, não uma
 * licença para passar objetos inteiros: continue selecionando só os campos
 * relevantes para a mudança em cada chamada.
 */
export function recordAudit(client: PrismaClient, input: RecordAuditInput) {
  return client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorType: input.actorType ?? "USER",
      actorUserId: input.actorUserId ?? null,
      before: redactSensitiveFields(input.before) ?? undefined,
      after: redactSensitiveFields(input.after) ?? undefined,
      ip: input.ip ?? null,
    },
  });
}
