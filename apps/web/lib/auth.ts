import { verifyMessage } from "viem";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Extracts and verifies a wallet signature from the request headers.
 *
 * Expected headers:
 *   x-wallet-address: 0x...
 *   x-wallet-signature: 0x...  (optional in development)
 *   x-wallet-message: <the original signed message>  (optional in development)
 *
 * Authentication tiers (checked in order):
 *   1. Demo mode  → trust x-wallet-address, skip signature check
 *   2. Dev mode + address only → trust address, warn in console
 *   3. Full verification → validate signature via viem.verifyMessage
 *
 * Returns the verified wallet address or throws.
 */
export async function verifyWalletSignature(request: Request): Promise<string> {
  const address = request.headers.get("x-wallet-address");
  const signature = request.headers.get("x-wallet-signature");
  const message = request.headers.get("x-wallet-message");

  logger.info(
    { address: address ?? "(missing)", hasSignature: !!signature, hasMessage: !!message },
    "Auth headers received",
  );

  if (!address) {
    throw Errors.unauthorized("Missing wallet address header");
  }

  // Tier 1: Demo mode — trust the address header entirely
  if (DEMO_MODE) {
    logger.info({ address }, "Demo mode: wallet address accepted without signature verification");
    return address;
  }

  // Tier 2: Development mode — allow address-only auth (no signature needed)
  if (IS_DEV && address && !signature) {
    logger.warn(
      { address },
      "⚠️  Dev bypass: address-only auth accepted (no signature). " +
        "This will NOT work in production.",
    );
    return address;
  }

  // Tier 3: Full cryptographic verification
  if (!signature || !message) {
    throw Errors.unauthorized("Missing wallet authentication headers");
  }

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      throw Errors.unauthorized("Invalid wallet signature");
    }

    logger.info({ address }, "Wallet signature verified");
    return address;
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid wallet signature") {
      throw err;
    }
    logger.warn({ address, err }, "Wallet signature verification failed");
    throw Errors.unauthorized("Wallet signature verification failed");
  }
}
