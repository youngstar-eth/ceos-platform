/**
 * @repo/wallet — Wallet Data Encryption
 *
 * AES-256-GCM encryption for cdpWalletData JSON exports.
 * Uses WALLET_ENCRYPTION_KEY env var (hex-encoded 32-byte key).
 *
 * In production, this key MUST come from a KMS (AWS KMS, GCP KMS, etc.).
 * NEVER hardcode or commit the key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const keyHex = process.env.WALLET_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      '[SECURITY] WALLET_ENCRYPTION_KEY is not set. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `[SECURITY] WALLET_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${key.length} bytes`,
    );
  }
  return key;
}

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Hex-encoded 12-byte IV/nonce */
  nonce: string;
  /** Hex-encoded 16-byte GCM auth tag */
  tag: string;
}

/**
 * Encrypt sensitive wallet data with AES-256-GCM.
 * Returns a JSON-serializable payload with ciphertext, nonce, and auth tag.
 */
export function encryptWalletData(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    nonce: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt wallet data previously encrypted with encryptWalletData().
 * Throws if the auth tag doesn't match (tampered data).
 */
export function decryptWalletData(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.nonce, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Convenience: encrypt and serialize to a single DB-storable string.
 * Format: base64(JSON({ ciphertext, nonce, tag }))
 */
export function encryptForStorage(plaintext: string): string {
  const payload = encryptWalletData(plaintext);
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Convenience: deserialize and decrypt from a single DB-stored string.
 */
export function decryptFromStorage(stored: string): string {
  const json = Buffer.from(stored, 'base64').toString('utf8');
  const payload: EncryptedPayload = JSON.parse(json);
  return decryptWalletData(payload);
}
