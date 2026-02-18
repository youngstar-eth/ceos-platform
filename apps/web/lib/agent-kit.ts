import { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { AgentKit } from '@coinbase/agentkit';

// ---------------------------------------------------------------------------
// Coinbase AgentKit Service
//
// Factory function that creates or restores a CDP server-managed EVM wallet.
//
// The new `CdpEvmWalletProvider` uses server-side key management — the private
// key lives in Coinbase's infrastructure and is never exposed.  To "restore" a
// wallet we simply pass its address back to `configureWithWallet`.
//
// Required env vars:
//   CDP_API_KEY_NAME       → maps to `apiKeyId`
//   CDP_API_KEY_PRIVATE_KEY → maps to `apiKeySecret` (PEM, newlines as \\n)
//   CDP_WALLET_SECRET      → symmetric secret for wallet operations
//
// Usage:
//   const { agentKit, walletProvider } = await getAgentKit();           // new
//   const { agentKit, walletProvider } = await getAgentKit(savedData);  // restore
// ---------------------------------------------------------------------------

interface AgentKitResult {
  agentKit: AgentKit;
  walletProvider: CdpEvmWalletProvider;
}

/**
 * Create or restore a CDP server-managed EVM wallet via AgentKit.
 *
 * @param walletData - Optional JSON string from a previous `exportWallet()`.
 *                     If provided, uses the stored address to reconnect.
 *                     Otherwise creates a new wallet.
 * @returns The AgentKit instance + wallet provider (for address/export ops).
 */
export async function getAgentKit(walletData?: string): Promise<AgentKitResult> {
  const apiKeyId = process.env.CDP_API_KEY_NAME;
  const walletSecret = process.env.CDP_WALLET_SECRET;

  // ── Sanitize PEM key ───────────────────────────────────────────────────
  // .env files store the key as a single line with literal "\n" characters.
  // We must convert those back into real newlines so the PEM envelope is
  // valid.  We also trim any surrounding quotes that some .env loaders
  // may leave behind.
  let apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY ?? '';
  apiKeySecret = apiKeySecret
    .replace(/^["']|["']$/g, '')   // strip surrounding quotes
    .replace(/\\n/g, '\n')         // literal \n → real newline
    .trim();

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      'Missing CDP credentials. Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY in .env',
    );
  }

  // Build config — restore from address if walletData exists
  const config: Parameters<typeof CdpEvmWalletProvider.configureWithWallet>[0] = {
    apiKeyId,
    apiKeySecret,
    networkId: 'base-sepolia',
    ...(walletSecret ? { walletSecret } : {}),
  };

  if (walletData) {
    try {
      const parsed = JSON.parse(walletData) as { address?: string; name?: string };
      if (parsed.address) {
        config.address = parsed.address as `0x${string}`;
      }
    } catch {
      // If walletData is a plain address string, use it directly
      if (walletData.startsWith('0x')) {
        config.address = walletData as `0x${string}`;
      }
    }
  }

  const walletProvider = await CdpEvmWalletProvider.configureWithWallet(config);
  const agentKit = await AgentKit.from({ walletProvider });

  return { agentKit, walletProvider };
}
