import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM para segredos em repouso no DB (ex.: senha de certificado do cliente).
 *
 * Formato do texto cifrado: `v1:${saltHex}:${ivHex}:${tagHex}:${cipherHex}`
 *   - v1 sinaliza versão do formato (permite migração futura sem quebrar leitura)
 *   - salt (16B) + KDF scrypt → nunca guardar a chave AES bruta em disco
 *   - iv (12B) único por operação
 *   - tag (16B) — auth tag GCM
 *   - cipher — texto cifrado
 *
 * A chave master vem de `process.env.ENCRYPTION_KEY` (32+ chars aleatórios).
 * Se rotacionar a env, os valores antigos ficam ilegíveis — planejar re-cifragem.
 */

const VERSION = "v1";

function getMasterKey(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY ausente ou curta (< 32 chars). Configure no .env.local antes de cifrar segredos.",
    );
  }
  return k;
}

function deriveKey(master: string, salt: Buffer): Buffer {
  return scryptSync(master, salt, 32);
}

export function cifrar(plaintext: string): string {
  if (!plaintext) return "";
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(getMasterKey(), salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherBuf = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, salt.toString("hex"), iv.toString("hex"), tag.toString("hex"), cipherBuf.toString("hex")].join(":");
}

export function decifrar(encoded: string): string {
  if (!encoded) return "";
  const [version, saltHex, ivHex, tagHex, cipherHex] = encoded.split(":");
  if (version !== VERSION) throw new Error(`Formato de cifra desconhecido: ${version}`);
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const cipherBuf = Buffer.from(cipherHex, "hex");
  const key = deriveKey(getMasterKey(), salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherBuf), decipher.final()]).toString("utf8");
}
