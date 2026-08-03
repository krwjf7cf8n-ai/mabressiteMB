/**
 * Regras de domínio de Visitas — máquina de estados e detecção de conflito de
 * agenda. Vivem aqui (não escondidas na interface) para serem testáveis
 * isoladamente e reaproveitadas tanto pelo server action quanto por testes.
 */

export type VisitStatus =
  | "AGUARDANDO_CONFIRMACAO"
  | "CONFIRMADA"
  | "REAGENDADA"
  | "REALIZADA"
  | "CANCELADA_CLIENTE"
  | "CANCELADA_CORRETOR"
  | "CLIENTE_NAO_COMPARECEU"
  | "PROPRIETARIO_INDISPONIVEL";

/** Transições permitidas em operação normal (sem exceção administrativa). */
export const VISIT_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  AGUARDANDO_CONFIRMACAO: [
    "CONFIRMADA",
    "REAGENDADA",
    "CANCELADA_CLIENTE",
    "CANCELADA_CORRETOR",
    "PROPRIETARIO_INDISPONIVEL",
  ],
  CONFIRMADA: [
    "REALIZADA",
    "REAGENDADA",
    "CANCELADA_CLIENTE",
    "CANCELADA_CORRETOR",
    "CLIENTE_NAO_COMPARECEU",
    "PROPRIETARIO_INDISPONIVEL",
  ],
  REAGENDADA: ["CONFIRMADA", "AGUARDANDO_CONFIRMACAO", "CANCELADA_CLIENTE", "CANCELADA_CORRETOR"],
  CLIENTE_NAO_COMPARECEU: ["REAGENDADA", "CANCELADA_CORRETOR"],
  PROPRIETARIO_INDISPONIVEL: ["REAGENDADA", "CANCELADA_CORRETOR"],
  // Estados terminais: nenhuma transição livre. Sair deles exige allowException (correção
  // administrativa explícita, com justificativa e auditoria — nunca reabertura silenciosa).
  REALIZADA: [],
  CANCELADA_CLIENTE: [],
  CANCELADA_CORRETOR: [],
};

export const VISIT_TERMINAL_STATUSES: VisitStatus[] = ["REALIZADA", "CANCELADA_CLIENTE", "CANCELADA_CORRETOR"];

export function isVisitTerminal(status: VisitStatus): boolean {
  return VISIT_TERMINAL_STATUSES.includes(status);
}

/**
 * Verifica se a transição é permitida. `allowException` só deve ser passado
 * `true` pela camada de aplicação depois de confirmar permissão
 * (`visits:override_conflict` ou equivalente administrativo) e justificativa
 * preenchida — a função em si não sabe de permissões, só da regra de estado.
 */
export function canTransitionVisit(
  from: VisitStatus,
  to: VisitStatus,
  options: { allowException?: boolean } = {},
): boolean {
  if (from === to) return false;
  if (VISIT_TRANSITIONS[from]?.includes(to)) return true;
  if (options.allowException && isVisitTerminal(from)) return true;
  return false;
}

export function computeVisitEndsAt(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + durationMinutes * 60_000);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface VisitConflictCandidate {
  id?: string; // ausente quando é a visita sendo criada
  contactId: string;
  propertyId: string;
  brokerUserId: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: VisitStatus;
}

export interface VisitConflictReason {
  visitId: string;
  type: "corretor" | "cliente" | "imovel";
}

/** Status que efetivamente ocupam agenda — visitas canceladas/realizadas não geram conflito. */
const ACTIVE_CONFLICT_STATUSES: VisitStatus[] = ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"];

/**
 * Detecta sobreposição de horário entre a visita candidata e visitas
 * existentes, para o mesmo corretor, cliente ou imóvel. Não bloqueia
 * automaticamente — só relata; a camada de aplicação decide se permite
 * seguir (com permissão + justificativa) ou impede.
 *
 * `minIntervalMinutes` adiciona uma margem antes/depois do horário da
 * candidata (ex.: exigir 15 min livres entre visitas do mesmo corretor).
 */
export function findVisitConflicts(
  candidate: VisitConflictCandidate,
  existingVisits: VisitConflictCandidate[],
  minIntervalMinutes = 0,
): VisitConflictReason[] {
  const candidateStart = candidate.scheduledAt;
  const candidateEnd = computeVisitEndsAt(candidateStart, candidate.durationMinutes);
  const bufferedStart = new Date(candidateStart.getTime() - minIntervalMinutes * 60_000);
  const bufferedEnd = new Date(candidateEnd.getTime() + minIntervalMinutes * 60_000);

  const reasons: VisitConflictReason[] = [];

  for (const other of existingVisits) {
    if (candidate.id && other.id === candidate.id) continue;
    if (!ACTIVE_CONFLICT_STATUSES.includes(other.status)) continue;

    const otherStart = other.scheduledAt;
    const otherEnd = computeVisitEndsAt(otherStart, other.durationMinutes);
    if (!rangesOverlap(bufferedStart, bufferedEnd, otherStart, otherEnd)) continue;

    if (!other.id) continue;
    if (other.brokerUserId === candidate.brokerUserId) reasons.push({ visitId: other.id, type: "corretor" });
    if (other.contactId === candidate.contactId) reasons.push({ visitId: other.id, type: "cliente" });
    if (other.propertyId === candidate.propertyId) reasons.push({ visitId: other.id, type: "imovel" });
  }

  return reasons;
}
