import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para campos sensíveis que precisam ser
 * recuperáveis em texto (ex.: dados bancários do proprietário) — diferente de
 * senha (que usa hash irreversível, ver password.ts). A chave nunca fica no
 * código: vem de `ENCRYPTION_KEY` (variável de ambiente).
 */

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY não configurada. Defina uma chave forte no .env antes de gravar dados sensíveis.",
    );
  }
  // deriva uma chave de 32 bytes a partir do segredo configurado
  return scryptSync(secret, "mabres-crm-salt", 32);
}

export function encryptSensitiveField(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSensitiveField(ciphertext: string): string {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Formato de dado criptografado inválido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
