/* ============================================================
 * XMTP Chat Agent — Environment Configuration
 *
 * Zod-validated env vars for XMTP agent runtime.
 * ============================================================ */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const xmtpEnvSchema = z.object({
  /** XMTP wallet private key (hex-encoded, with or without 0x prefix) */
  XMTP_WALLET_KEY: z
    .string()
    .min(1, "XMTP_WALLET_KEY is required")
    .refine(
      (val) => /^(0x)?[0-9a-fA-F]{64}$/.test(val),
      "XMTP_WALLET_KEY must be a valid 32-byte hex private key"
    ),

  /** 32-byte encryption key for local XMTP database (hex-encoded) */
  XMTP_DB_ENCRYPTION_KEY: z
    .string()
    .min(1, "XMTP_DB_ENCRYPTION_KEY is required")
    .refine(
      (val) => /^(0x)?[0-9a-fA-F]{64}$/.test(val),
      "XMTP_DB_ENCRYPTION_KEY must be a valid 32-byte hex key"
    ),

  /** XMTP network environment */
  XMTP_ENV: z.enum(["production", "dev"], {
    errorMap: () => ({ message: "XMTP_ENV must be 'production' or 'dev'" }),
  }),

  /** Base URL for the leaderboard API (no trailing slash) */
  LEADERBOARD_API_URL: z
    .string()
    .url("LEADERBOARD_API_URL must be a valid URL")
    .transform((url) => url.replace(/\/+$/, "")),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type XmtpEnvConfig = z.infer<typeof xmtpEnvSchema>;

// ---------------------------------------------------------------------------
// Validated Config
// ---------------------------------------------------------------------------

function loadXmtpConfig(): XmtpEnvConfig {
  const result = xmtpEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[XMTP Config] Invalid environment configuration:\n${issues}`
    );
  }

  return result.data;
}

export const xmtpConfig = loadXmtpConfig();
