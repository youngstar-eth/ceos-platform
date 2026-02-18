import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for agent wallet private keys.
//
// In production the WALLET_ENCRYPTION_KEY should come from a KMS or Vault.
// For local dev, we derive a 32-byte key from the DEPLOYER_PRIVATE_KEY so
// there is *always* a key available without extra env-var setup.
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const TAG_LENGTH = 16; // 128 bits authentication tag

/**
 * Derive a 32-byte encryption key.
 *
 * Priority:
 *   1. `WALLET_ENCRYPTION_KEY` env var (hex-encoded, 64 chars)
 *   2. First 32 bytes of `DEPLOYER_PRIVATE_KEY` (fallback for dev)
 */
function getEncryptionKey(): Buffer {
  const explicit = process.env.WALLET_ENCRYPTION_KEY;
  if (explicit) {
    const buf = Buffer.from(explicit, 'hex');
    if (buf.length !== 32) {
      throw new Error('WALLET_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)');
    }
    return buf;
  }

  // Fallback: hash the deployer private key to get a deterministic 32-byte key
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error('No encryption key available. Set WALLET_ENCRYPTION_KEY or DEPLOYER_PRIVATE_KEY');
  }

  // Strip 0x prefix, take first 64 hex chars (32 bytes)
  const hex = deployerKey.replace(/^0x/, '').slice(0, 64).padEnd(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a single base64 string: `iv:ciphertext:authTag`
 */
export function encryptPrivateKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine: iv + ciphertext + authTag → base64
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * Decrypt an encrypted private key (produced by `encryptPrivateKey`).
 */
export function decryptPrivateKey(encoded: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encoded, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
