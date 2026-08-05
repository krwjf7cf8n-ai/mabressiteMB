import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Senha temporária forte, exibida uma única vez a quem criou o usuário ou
 * pediu a redefinição — nunca logada, nunca persistida em texto claro
 * (só o hash via `hashPassword`). Sempre satisfaz `passwordPolicySchema`
 * (≥10 caracteres, ao menos uma letra e um número) — base64url puro
 * ocasionalmente sai só com letras, então regenera até ter os dois.
 */
export function generateTempPassword(): string {
  let candidate: string;
  do {
    candidate = randomBytes(9).toString("base64url");
  } while (!/[a-zA-Z]/.test(candidate) || !/[0-9]/.test(candidate));
  return candidate;
}
