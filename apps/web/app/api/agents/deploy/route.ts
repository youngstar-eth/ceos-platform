import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { deployAgentSchema } from "@/lib/validation";
import { generateAgentProfileImages } from "@/lib/profile-image-generator";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const NEYNAR_API_BASE = "https://api.neynar.com/v2/farcaster";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? "";
const NEYNAR_WALLET_ID = process.env.NEYNAR_WALLET_ID ?? "";

/**
 * POST /api/agents/deploy
 *
 * Orchestrate agent deployment:
 * 1. Verify wallet signature
 * 2. Validate the agent exists and belongs to caller
 * 3. In demo mode: skip on-chain tx, directly activate agent
 * 4. In production: verify on-chain tx, transition to DEPLOYING
 * 5. Generate a mock Farcaster FID (demo) or call Neynar (production)
 * 6. Update agent in database
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();

    if (DEMO_MODE) {
      return handleDemoDeployment(body, address);
    }

    return handleProductionDeployment(body, address);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Demo mode: skip blockchain, create real Farcaster account, activate immediately.
 */
async function handleDemoDeployment(body: unknown, address: string) {
  const data = deployAgentSchema.parse(body);

  const agent = await prisma.agent.findUnique({
    where: { id: data.agentId },
  });

  if (!agent) {
    throw Errors.notFound("Agent");
  }

  if (agent.creatorAddress !== address) {
    throw Errors.forbidden("Only the creator can deploy this agent");
  }

  if (agent.status !== "PENDING") {
    throw Errors.conflict(
      `Agent cannot be deployed from status "${agent.status}"`,
    );
  }

  // Generate a Farcaster-compatible username from agent name
  const baseUsername = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
  const username = `${baseUsername}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const persona =
    typeof agent.persona === "string"
      ? agent.persona
      : ((agent.persona as Record<string, unknown>)?.description as string) ??
        "";

  // Generate profile images (non-blocking on failure)
  let generatedPfpUrl: string | null = null;
  let generatedBannerUrl: string | null = null;
  try {
    const personaObj =
      typeof agent.persona === "object" && agent.persona !== null
        ? (agent.persona as Record<string, unknown>)
        : {};

    const profileImages = await generateAgentProfileImages({
      name: agent.name,
      description: agent.description,
      persona: personaObj,
      skills: agent.skills,
    });

    generatedPfpUrl = profileImages.pfpUrl;
    generatedBannerUrl = profileImages.bannerUrl;

    logger.info(
      { hasPfp: !!generatedPfpUrl, hasBanner: !!generatedBannerUrl },
      "Profile images generated",
    );
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "Profile image generation failed, continuing without images",
    );
  }

  // Create real Farcaster account via Neynar
  let fid: number;
  let signerUuid: string;
  let custodyAddress: string;

  if (!NEYNAR_WALLET_ID) {
    logger.warn("NEYNAR_WALLET_ID not set, falling back to demo signer");
    fid = 800000 + Math.floor(Math.random() * 100000);
    signerUuid = `demo-signer-${crypto.randomUUID()}`;
    custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
  } else {
    try {
      const account = await createFarcasterAccount({
        walletId: NEYNAR_WALLET_ID,
        username,
        displayName: agent.name,
        bio: persona.slice(0, 160) || `AI agent on Farcaster | Powered by ceos.run`,
        pfpUrl: generatedPfpUrl ?? undefined,
        agentId: agent.id,
      });

      fid = account.fid;
      signerUuid = account.signerUuid;
      custodyAddress = account.custodyAddress;

      logger.info(
        { agentId: agent.id, fid, username, signerUuid: signerUuid.slice(0, 8) + "..." },
        "Farcaster account created for agent",
      );
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to create Farcaster account",
      );

      fid = 800000 + Math.floor(Math.random() * 100000);
      signerUuid = `demo-signer-${crypto.randomUUID()}`;
      custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    }
  }

  // Set banner on Farcaster profile (requires signer, so must be after account creation)
  if (generatedBannerUrl && signerUuid && !signerUuid.startsWith("demo-signer-")) {
    try {
      await updateFarcasterProfile(signerUuid, { pfpUrl: generatedPfpUrl, bannerUrl: generatedBannerUrl });
      logger.info("Banner image set on Farcaster profile");
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to set banner image, continuing",
      );
    }
  }

  // === Awal Wallet Provisioning ===
  let walletResult: { walletId: string; address: string; email: string } | null = null;
  try {
    const { provisionAgentWallet } = await import('@/lib/awal');
    walletResult = await provisionAgentWallet(data.agentId, agent.name);
    logger.info({ agentId: data.agentId, walletAddress: walletResult.address }, 'Awal wallet provisioned');
  } catch (walletError) {
    // Wallet provisioning failure is non-fatal — agent can still operate without wallet
    logger.warn(
      { agentId: data.agentId, error: walletError instanceof Error ? walletError.message : String(walletError) },
      'Awal wallet provisioning failed — agent will operate without autonomous wallet',
    );
  }

  const updated = await prisma.agent.update({
    where: { id: data.agentId },
    data: {
      status: "ACTIVE",
      fid,
      onChainAddress: custodyAddress,
      signerUuid,
      ...(generatedPfpUrl && { pfpUrl: generatedPfpUrl }),
      ...(generatedBannerUrl && { bannerUrl: generatedBannerUrl }),
      walletAddress: walletResult?.address ?? null,
      walletEmail: walletResult?.email ?? null,
      walletSessionLimit: Number(process.env.AWAL_DEFAULT_SESSION_LIMIT ?? 50),
      walletTxLimit: Number(process.env.AWAL_DEFAULT_TX_LIMIT ?? 10),
    },
  });

  const isRealAccount = !signerUuid.startsWith("demo-signer-");

  logger.info(
    { agentId: data.agentId, fid, creator: address, realAccount: isRealAccount },
    "Agent deployed in DEMO mode",
  );

  return successResponse(
    {
      agent: updated,
      mode: "demo",
      farcasterAccount: isRealAccount
        ? { fid, username, custodyAddress }
        : null,
      message: isRealAccount
        ? `Agent deployed with Farcaster account @${username} (FID: ${fid})`
        : "Agent deployed in demo mode with mock signer. Fund the Neynar wallet to enable real accounts.",
    },
    201,
  );
}

/**
 * Create a Farcaster account via Neynar managed account creation.
 *
 * Flow:
 * 1. Reserve FID via GET /user/fid (returns just {fid})
 * 2. Generate EIP-712 signature with a temporary wallet (viem)
 * 3. Register account via POST /user with signature + metadata
 */
async function createFarcasterAccount(options: {
  walletId: string;
  username: string;
  displayName: string;
  bio: string;
  pfpUrl?: string;
  agentId: string;
}): Promise<{ fid: number; signerUuid: string; username: string; custodyAddress: string }> {
  const {
    ID_REGISTRY_ADDRESS,
    ViemLocalEip712Signer,
    idRegistryABI,
  } = await import("@farcaster/hub-nodejs");
  const { bytesToHex, createPublicClient, http, keccak256, toBytes } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { optimism } = await import("viem/chains");

  // Step 1: Reserve FID
  const fidRes = await fetch(`${NEYNAR_API_BASE}/user/fid`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      api_key: NEYNAR_API_KEY,
      "x-wallet-id": options.walletId,
    },
  });

  if (!fidRes.ok) {
    const errText = await fidRes.text().catch(() => "Unknown error");
    throw new Error(`Failed to reserve FID: ${fidRes.status} ${errText}`);
  }

  const fidData = (await fidRes.json()) as { fid: number };
  logger.info({ fid: fidData.fid }, "Reserved FID");

  // Step 2: Derive a unique custody wallet per agent from DEPLOYER_PRIVATE_KEY + agentId.
  // This ensures each agent gets its own Farcaster custody address.
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const derivedKey = keccak256(
    toBytes(`${deployerKey}:${options.agentId}`),
  );
  const account = privateKeyToAccount(derivedKey);
  const custodyAddress = account.address;
  logger.info({ custodyAddress }, "Derived custody address for agent");

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem version mismatch between workspace packages
  const eip712Signer = new ViemLocalEip712Signer(account as any);

  // Read nonce from IdRegistry contract on Optimism
  const publicClient = createPublicClient({
    chain: optimism,
    transport: http(),
  });

  const nonce = await publicClient.readContract({
    address: ID_REGISTRY_ADDRESS,
    abi: idRegistryABI,
    functionName: "nonces",
    args: [custodyAddress],
  });

  logger.info({ custodyAddress, nonce: nonce?.toString() }, "Custody address derived");

  // Sign transfer (Neynar pre-registers FID then transfers to our custody address)
  const signatureResult = await eip712Signer.signTransfer({
    fid: BigInt(fidData.fid),
    to: custodyAddress,
    nonce: nonce as bigint,
    deadline,
  });

  if (signatureResult.isErr()) {
    throw new Error(`Failed to sign transfer: ${signatureResult.error}`);
  }

  const signature = bytesToHex(signatureResult.value);
  logger.info({ deadline: Number(deadline) }, "Transfer signature generated");

  // Step 3: Register account with Neynar
  const registerRes = await fetch(`${NEYNAR_API_BASE}/user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      api_key: NEYNAR_API_KEY,
      "x-wallet-id": options.walletId,
    },
    body: JSON.stringify({
      signature,
      fid: fidData.fid,
      requested_user_custody_address: custodyAddress,
      deadline: Number(deadline),
      fname: options.username,
      metadata: {
        bio: options.bio,
        pfp_url: options.pfpUrl ?? "",
        display_name: options.displayName,
        url: "",
      },
    }),
  });

  if (!registerRes.ok) {
    const errText = await registerRes.text().catch(() => "Unknown error");
    throw new Error(`Failed to register account: ${registerRes.status} ${errText}`);
  }

  const registerData = (await registerRes.json()) as {
    success: boolean;
    message: string;
    signer: {
      signer_uuid: string;
      public_key: string;
      status: string;
      fid: number;
    };
  };

  return {
    fid: fidData.fid,
    signerUuid: registerData.signer?.signer_uuid ?? "",
    username: options.username,
    custodyAddress,
  };
}

/**
 * Update a Farcaster profile after account creation (e.g. set banner image).
 * Uses Neynar PATCH /v2/farcaster/user endpoint.
 */
async function updateFarcasterProfile(
  signerUuid: string,
  updates: { pfpUrl?: string | null; bannerUrl?: string | null; bio?: string },
): Promise<void> {
  const body: Record<string, string> = { signer_uuid: signerUuid };

  if (updates.pfpUrl) body["pfp_url"] = updates.pfpUrl;
  if (updates.bio) body["bio"] = updates.bio;

  // Note: Neynar PATCH /user doesn't currently support a banner_url field.
  // Banner is stored in our DB for dashboard display.
  // PFP is updated here in case it wasn't set during account creation.

  const res = await fetch(`${NEYNAR_API_BASE}/user`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      api_key: NEYNAR_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Failed to update Farcaster profile: ${res.status} ${errText}`);
  }
}

/**
 * Production mode: verify on-chain tx hash, create Farcaster account, and activate.
 * This is called after the on-chain transaction is confirmed by the frontend.
 */
async function handleProductionDeployment(body: unknown, address: string) {
  const data = deployAgentSchema.parse(body);

  const agent = await prisma.agent.findUnique({
    where: { id: data.agentId },
  });

  if (!agent) {
    throw Errors.notFound("Agent");
  }

  if (agent.creatorAddress !== address) {
    throw Errors.forbidden("Only the creator can deploy this agent");
  }

  // Allow PENDING (first call) or DEPLOYING (retry) status
  if (agent.status !== "PENDING" && agent.status !== "DEPLOYING") {
    throw Errors.conflict(
      `Agent cannot be deployed from status "${agent.status}"`,
    );
  }

  // Generate username from agent name
  const baseUsername = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
  const username = `${baseUsername}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const persona =
    typeof agent.persona === "string"
      ? agent.persona
      : ((agent.persona as Record<string, unknown>)?.description as string) ??
        "";

  // Generate profile images (non-blocking on failure)
  let generatedPfpUrl: string | null = null;
  let generatedBannerUrl: string | null = null;
  try {
    const personaObj =
      typeof agent.persona === "object" && agent.persona !== null
        ? (agent.persona as Record<string, unknown>)
        : {};

    const profileImages = await generateAgentProfileImages({
      name: agent.name,
      description: agent.description,
      persona: personaObj,
      skills: agent.skills,
    });

    generatedPfpUrl = profileImages.pfpUrl;
    generatedBannerUrl = profileImages.bannerUrl;

    logger.info(
      { hasPfp: !!generatedPfpUrl, hasBanner: !!generatedBannerUrl },
      "Profile images generated (production)",
    );
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "Profile image generation failed in production, continuing without images",
    );
  }

  // Create Farcaster account
  let fid: number;
  let signerUuid: string;
  let custodyAddress: string;

  if (!NEYNAR_WALLET_ID) {
    logger.warn("NEYNAR_WALLET_ID not set, falling back to demo signer (production)");
    fid = 800000 + Math.floor(Math.random() * 100000);
    signerUuid = `demo-signer-${crypto.randomUUID()}`;
    custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
  } else {
    try {
      const account = await createFarcasterAccount({
        walletId: NEYNAR_WALLET_ID,
        username,
        displayName: agent.name,
        bio: persona.slice(0, 160) || `AI agent on Farcaster | Powered by ceos.run`,
        pfpUrl: generatedPfpUrl ?? undefined,
        agentId: agent.id,
      });

      fid = account.fid;
      signerUuid = account.signerUuid;
      custodyAddress = account.custodyAddress;

      logger.info(
        { agentId: agent.id, fid, username, signerUuid: signerUuid.slice(0, 8) + "..." },
        "Farcaster account created for agent (production)",
      );
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to create Farcaster account (production)",
      );

      fid = 800000 + Math.floor(Math.random() * 100000);
      signerUuid = `demo-signer-${crypto.randomUUID()}`;
      custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    }
  }

  // Set banner on Farcaster profile
  if (generatedBannerUrl && signerUuid && !signerUuid.startsWith("demo-signer-")) {
    try {
      await updateFarcasterProfile(signerUuid, { pfpUrl: generatedPfpUrl, bannerUrl: generatedBannerUrl });
      logger.info("Banner image set on Farcaster profile (production)");
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to set banner image in production, continuing",
      );
    }
  }

  // Awal Wallet Provisioning
  let walletResult: { walletId: string; address: string; email: string } | null = null;
  try {
    const { provisionAgentWallet } = await import('@/lib/awal');
    walletResult = await provisionAgentWallet(data.agentId, agent.name);
    logger.info({ agentId: data.agentId, walletAddress: walletResult.address }, 'Awal wallet provisioned (production)');
  } catch (walletError) {
    logger.warn(
      { agentId: data.agentId, error: walletError instanceof Error ? walletError.message : String(walletError) },
      'Awal wallet provisioning failed in production — agent will operate without autonomous wallet',
    );
  }

  const updated = await prisma.agent.update({
    where: { id: data.agentId },
    data: {
      status: "ACTIVE",
      fid,
      onChainAddress: data.txHash ?? custodyAddress,
      signerUuid,
      ...(generatedPfpUrl && { pfpUrl: generatedPfpUrl }),
      ...(generatedBannerUrl && { bannerUrl: generatedBannerUrl }),
      walletAddress: walletResult?.address ?? null,
      walletEmail: walletResult?.email ?? null,
      walletSessionLimit: Number(process.env.AWAL_DEFAULT_SESSION_LIMIT ?? 50),
      walletTxLimit: Number(process.env.AWAL_DEFAULT_TX_LIMIT ?? 10),
    },
  });

  const isRealAccount = !signerUuid.startsWith("demo-signer-");

  logger.info(
    { agentId: data.agentId, fid, txHash: data.txHash, creator: address, realAccount: isRealAccount },
    "Agent deployed in PRODUCTION mode",
  );

  return successResponse(
    {
      agent: updated,
      mode: "production",
      farcasterAccount: isRealAccount
        ? { fid, username, custodyAddress }
        : null,
      message: isRealAccount
        ? `Agent deployed on-chain and Farcaster account @${username} created (FID: ${fid})`
        : "Agent deployed on-chain. Fund the Neynar wallet to enable real Farcaster accounts.",
    },
    201,
  );
}
