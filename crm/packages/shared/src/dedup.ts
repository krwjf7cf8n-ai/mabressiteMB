/** Normaliza telefone/WhatsApp brasileiro para comparação de duplicidade (somente dígitos, com DDI 55). */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // remove DDI 55 se presente, para comparar só DDD+número, depois recoloca
  const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return `55${withoutCountry}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

export interface DuplicateCandidateFields {
  id: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  metaLeadId?: string | null;
}

export interface DuplicateMatchReason {
  candidateId: string;
  matchedOn: Array<"phone" | "whatsapp" | "email" | "metaLeadId">;
}

/**
 * Compara um novo contato contra candidatos existentes e retorna os que
 * colidem por telefone, WhatsApp, e-mail ou identificador externo (Meta).
 * Não decide sozinho: a aplicação deve pedir confirmação antes de mesclar.
 */
export function findDuplicateMatches(
  incoming: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    metaLeadId?: string | null;
  },
  candidates: DuplicateCandidateFields[],
): DuplicateMatchReason[] {
  const incomingPhone = normalizePhoneBR(incoming.phone);
  const incomingWhatsapp = normalizePhoneBR(incoming.whatsapp);
  const incomingEmail = normalizeEmail(incoming.email);
  const incomingMetaLeadId = incoming.metaLeadId || null;

  const results: DuplicateMatchReason[] = [];

  for (const candidate of candidates) {
    const matchedOn: DuplicateMatchReason["matchedOn"] = [];
    if (incomingPhone && incomingPhone === normalizePhoneBR(candidate.phone)) matchedOn.push("phone");
    if (incomingWhatsapp && incomingWhatsapp === normalizePhoneBR(candidate.whatsapp))
      matchedOn.push("whatsapp");
    if (incomingEmail && incomingEmail === normalizeEmail(candidate.email)) matchedOn.push("email");
    if (incomingMetaLeadId && incomingMetaLeadId === candidate.metaLeadId) matchedOn.push("metaLeadId");

    if (matchedOn.length > 0) {
      results.push({ candidateId: candidate.id, matchedOn });
    }
  }

  return results;
}
