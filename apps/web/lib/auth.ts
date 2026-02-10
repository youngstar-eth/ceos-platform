import { verifyMessage } from "viem";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Extracts and verifies a wallet signature from the request headers.
 *
 * Expected headers:
 *   x-wallet-address: 0x...
 *   x-wallet-signature: 0x...
 *   x-wallet-message: <the original signed message>
 *
 * Returns the verified wallet address (checksummed) or throws.
 */
export async function verifyWalletSignature(request: Request): Promise<string> {
  const address = request.headers.get("x-wallet-address");
  const signature = request.headers.get("x-wallet-signature");
  const message = request.headers.get("x-wallet-message");

  if (!address || !signature || !message) {
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
