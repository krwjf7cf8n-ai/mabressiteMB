/**
 * G23 — evita injeção de cabeçalho via `Content-Disposition: ...filename="${id}"`:
 * um `id` vindo da URL poderia conter aspas, CR/LF ou `;` e quebrar o valor
 * do header (ou, em clientes vulneráveis, o nome do arquivo salvo). IDs do
 * Prisma (`cuid()`) só usam `[a-z0-9]`, então qualquer coisa fora desse
 * formato é tratada como suspeita e substituída por um nome genérico.
 */
export function safeFilenameSegment(value: string, fallback = "arquivo"): string {
  return /^[a-z0-9]+$/i.test(value) ? value : fallback;
}
