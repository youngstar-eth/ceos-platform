import { verifyMessage } from "viem";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_WALLET = "0xDE00000000000000000000000000000000000001";

/**
 * Extracts and verifies a wallet signature from the request headers.
 *
 * Expected headers:
 *   x-wallet-address: 0x...
 *   x-wallet-signature: 0x...
 *   x-wallet-message: <the original signed message>
 *
 * Returns the verified wallet address (checksummed) or throws.
 * In demo mode, skips cryptographic verification and trusts the address header.
 * If the address header is entirely missing in demo mode, falls back to DEMO_WALLET.
 */
export async function verifyWalletSignature(request: Request): Promise<string> {
  const address = request.headers.get("x-wallet-address");
  const signature = request.headers.get("x-wallet-signature");
  const message = request.headers.get("x-wallet-message");

  if (!address) {
    // GOD MODE: If no wallet header at all but demo mode is on,
    // use the canonical demo wallet so the request never fails.
    if (DEMO_MODE) {
      logger.info(
        "Demo mode: No wallet address header — falling back to DEMO_WALLET",
      );
      return DEMO_WALLET;
    }
    throw Errors.unauthorized("Missing wallet address header");
  }

  // In demo mode, skip signature verification — trust the address header
  if (DEMO_MODE) {
    logger.info({ address }, "Demo mode: wallet address accepted without signature verification");
    return address;
  }

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
