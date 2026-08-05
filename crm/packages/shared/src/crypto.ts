import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scryptSync } from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para campos sensíveis que precisam ser
 * recuperáveis em texto (ex.: dados bancários do proprietário) — diferente de
 * senha (que usa hash irreversível, ver password.ts). A chave nunca fica no
 * código: vem de `ENCRYPTION_KEY` (variável de ambiente).
 *
 * Formato do ciphertext (G2, Marco 1.9): `v1.iv.tag.data` — o prefixo de
 * versão identifica qual esquema de derivação de chave/formato foi usado
 * para gravar aquele valor, permitindo introduzir uma v2 (ex.: rotação de
 * chave) no futuro sem quebrar a leitura de dados já gravados. Ciphertexts
 * gravados antes desta mudança (sem prefixo de versão, formato `iv.tag.data`)
 * continuam sendo decriptados normalmente — ver `decryptSensitiveField`.
 */

const CIPHERTEXT_VERSION = "v1";
const MIN_KEY_LENGTH = 32; // mesmo tamanho, em caracteres, de uma chave AES-256 em bytes
const HKDF_INFO = "mabres-crm:field-encryption:v1"; // contexto público, fixo — não é segredo

function getRawSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY não configurada. Defina uma chave forte no .env antes de gravar dados sensíveis.",
    );
  }
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY fraca demais (mínimo ${MIN_KEY_LENGTH} caracteres). Gere uma chave aleatória forte (ex.: openssl rand -base64 32) antes de gravar dados sensíveis.`,
    );
  }
  return secret;
}

/**
 * Deriva a chave de 32 bytes usada pelo AES-256-GCM a partir de
 * `ENCRYPTION_KEY` via HKDF (RFC 5869) — não scrypt. `ENCRYPTION_KEY` já deve
 * ser um segredo de alta entropia (não uma senha de usuário), então não faz
 * sentido gastar uma KDF lenta/memory-hard pensada para proteger senhas
 * fracas, com salt fixo reaproveitado em toda derivação. HKDF é o primitivo
 * correto para expandir um segredo já forte numa chave de tamanho fixo — o
 * `info` é um contexto público (liga a chave derivada a este uso específico),
 * não um salt secreto.
 */
function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", HKDF_INFO, 32));
}

/**
 * Derivação usada apenas até a v1 (G2, Marco 1.9): scrypt com salt fixo
 * `"mabres-crm-salt"`. Mantida exclusivamente para decriptar valores
 * gravados antes da migração para HKDF — nunca usada para gravar dados novos.
 */
function deriveKeyLegacy(secret: string): Buffer {
  return scryptSync(secret, "mabres-crm-salt", 32);
}

export function encryptSensitiveField(plainText: string): string {
  const key = deriveKey(getRawSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [CIPHERTEXT_VERSION, iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ".",
  );
}

export function decryptSensitiveField(ciphertext: string): string {
  const secret = getRawSecret();
  const parts = ciphertext.split(".");

  let ivB64: string | undefined;
  let authTagB64: string | undefined;
  let dataB64: string | undefined;
  let key: Buffer;

  if (parts.length === 4 && parts[0] === CIPHERTEXT_VERSION) {
    [, ivB64, authTagB64, dataB64] = parts;
    key = deriveKey(secret);
  } else if (parts.length === 3) {
    // Formato legado (sem prefixo de versão), gravado antes do G2.
    [ivB64, authTagB64, dataB64] = parts;
    key = deriveKeyLegacy(secret);
  } else {
    throw new Error("Formato de dado criptografado inválido.");
  }

  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Formato de dado criptografado inválido.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Não foi possível decriptar o valor — dado corrompido, adulterado ou chave incorreta.");
  }
}
