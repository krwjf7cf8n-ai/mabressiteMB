/**
 * Converte dois objetos Json (before/after de um AuditLog ou VisitEvent) num
 * diff legível campo a campo, sem assumir um formato fixo — usado para
 * reconstruir a linha do tempo de tarefas (via AuditLog) e de visitas (via
 * VisitEvent) na interface.
 */
export function describeJsonDiff(before: unknown, after: unknown): string[] {
  const prev = (before ?? {}) as Record<string, unknown>;
  const next = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const lines: string[] = [];

  for (const key of keys) {
    const beforeValue = prev[key];
    const afterValue = next[key];
    if (beforeValue === undefined && afterValue === undefined) continue;
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;

    if (beforeValue === undefined) {
      lines.push(`${key}: ${JSON.stringify(afterValue)}`);
    } else if (afterValue === undefined) {
      lines.push(`${key}: ${JSON.stringify(beforeValue)} (removido)`);
    } else {
      lines.push(`${key}: ${JSON.stringify(beforeValue)} → ${JSON.stringify(afterValue)}`);
    }
  }

  return lines;
}
