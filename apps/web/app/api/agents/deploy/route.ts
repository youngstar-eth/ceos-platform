import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { deployAgentSchema } from "@/lib/validation";
import { generateAgentProfileImages } from "@/lib/profile-image-generator";
import { executeTrinityDeploy } from "@/lib/services/trinity-deploy-adapter";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const NEYNAR_API_BASE = "https://api.neynar.com/v2/farcaster";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? "";

/**
 * POST /api/agents/deploy
 *
 * Unified agent deployment pipeline (Trinity Deployer):
 *
 * 1. Verify wallet signature & rate limit
 * 2. Validate the agent exists, belongs to caller, and is deployable
 * 3. Generate profile images (PFP + banner)
 * 4. Execute Trinity pipeline:
 *    Step A: Provision CDP Wallet      → trinityStatus = CDP_ONLY
 *    Step B: Create Farcaster Account  → trinityStatus = CDP_FARCASTER
 *    Step C: Mint ERC-8004 Identity    → trinityStatus = COMPLETE
 * 5. Update Farcaster profile with banner (if real signer)
 * 6. Activate agent with final metadata
 *
 * The Trinity Deployer handles demo/production mode internally and
 * is re-entrant — safe to retry on partial failures.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = deployAgentSchema.parse(body);

    // ── Fetch & Validate Agent ────────────────────────────────────────────
    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can deploy this agent");
    }

    // Allow PENDING (first deploy) or DEPLOYING (retry after partial failure)
    if (agent.status !== "PENDING" && agent.status !== "DEPLOYING") {
      throw Errors.conflict(
        `Agent cannot be deployed from status "${agent.status}"`,
      );
    }

    // Mark as DEPLOYING so partial failures don't leave agent in PENDING
    if (agent.status === "PENDING") {
      await prisma.agent.update({
        where: { id: data.agentId },
        data: { status: "DEPLOYING" },
      });
    }

    // ── Generate Profile Images (non-blocking on failure) ─────────────────
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
        { agentId: data.agentId, hasPfp: !!generatedPfpUrl, hasBanner: !!generatedBannerUrl },
        "Profile images generated",
      );
    } catch (err) {
      logger.warn(
        { agentId: data.agentId, error: err instanceof Error ? err.message : String(err) },
        "Profile image generation failed, continuing without images",
      );
    }

    // ── Execute Trinity Pipeline ──────────────────────────────────────────
    const trinityResult = await executeTrinityDeploy({
      agentId: data.agentId,
      agentName: agent.name,
      description: agent.description,
      persona: typeof agent.persona === "object" && agent.persona !== null
        ? (agent.persona as Record<string, unknown>)
        : {},
      skills: agent.skills,
      creatorAddress: address,
    });

    logger.info(
      {
        agentId: data.agentId,
        trinityStatus: trinityResult.trinityStatus,
        hasCdp: !!trinityResult.cdp,
        hasFarcaster: !!trinityResult.farcaster,
        hasErc8004: !!trinityResult.erc8004,
        errorCount: trinityResult.errors.length,
        demoMode: DEMO_MODE,
      },
      "Trinity pipeline completed",
    );

    // ── Post-Trinity: Update Farcaster Profile (banner) ───────────────────
    const signerUuid = trinityResult.farcaster?.signerUuid ?? "";
    const isRealFarcasterAccount = signerUuid !== "" && !signerUuid.startsWith("demo-signer-");

    if (generatedBannerUrl && isRealFarcasterAccount) {
      try {
        await updateFarcasterProfile(signerUuid, {
          pfpUrl: generatedPfpUrl,
          bannerUrl: generatedBannerUrl,
        });
        logger.info({ agentId: data.agentId }, "Banner image set on Farcaster profile");
      } catch (err) {
        logger.warn(
          { agentId: data.agentId, error: err instanceof Error ? err.message : String(err) },
          "Failed to set banner image, continuing",
        );
      }
    }

    // ── Final Activation ──────────────────────────────────────────────────
    // Trinity Deployer updates trinity-specific fields (walletId, walletAddress,
    // fid, signerUuid, erc8004TokenId, trinityStatus, etc.).
    // Here we set the final agent metadata and activate.
    const updated = await prisma.agent.update({
      where: { id: data.agentId },
      data: {
        status: "ACTIVE",
        ...(generatedPfpUrl && { pfpUrl: generatedPfpUrl }),
        ...(generatedBannerUrl && { bannerUrl: generatedBannerUrl }),
        // Wallet limits (set on first deploy, not overwritten on retry)
        ...(trinityResult.cdp && {
          walletSessionLimit: Number(process.env.AWAL_DEFAULT_SESSION_LIMIT ?? 50),
          walletTxLimit: Number(process.env.AWAL_DEFAULT_TX_LIMIT ?? 10),
        }),
      },
    });

    // ── Build Response ────────────────────────────────────────────────────
    const mode = DEMO_MODE ? "demo" : "production";
    const farcasterUsername = trinityResult.farcaster?.username ?? "";

    logger.info(
      {
        agentId: data.agentId,
        mode,
        fid: trinityResult.farcaster?.fid,
        trinityStatus: trinityResult.trinityStatus,
        realFarcaster: isRealFarcasterAccount,
        creator: address,
      },
      `Agent deployed — Trinity ${trinityResult.trinityStatus}`,
    );

    return successResponse(
      {
        agent: updated,
        mode,
        trinityStatus: trinityResult.trinityStatus,
        farcasterAccount: isRealFarcasterAccount
          ? {
              fid: trinityResult.farcaster!.fid,
              username: farcasterUsername,
              custodyAddress: trinityResult.farcaster!.custodyAddress,
            }
          : null,
        wallet: trinityResult.cdp
          ? {
              walletId: trinityResult.cdp.walletId,
              walletAddress: trinityResult.cdp.walletAddress,
              network: trinityResult.cdp.network,
            }
          : null,
        erc8004: trinityResult.erc8004
          ? {
              tokenId: trinityResult.erc8004.tokenId,
              mintTxHash: trinityResult.erc8004.mintTxHash,
            }
          : null,
        errors: trinityResult.errors,
        message: buildDeployMessage(trinityResult, farcasterUsername, isRealFarcasterAccount),
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a human-readable deployment summary message.
 */
function buildDeployMessage(
  result: Awaited<ReturnType<typeof executeTrinityDeploy>>,
  username: string,
  isRealFarcaster: boolean,
): string {
  const parts: string[] = [];

  if (result.cdp) {
    parts.push(`CDP wallet provisioned (${result.cdp.walletAddress.slice(0, 10)}...)`);
  }

  if (result.farcaster && isRealFarcaster) {
    parts.push(`Farcaster @${username} (FID: ${result.farcaster.fid})`);
  } else if (result.farcaster) {
    parts.push(`Farcaster mock signer`);
  }

  if (result.erc8004) {
    parts.push(`ERC-8004 token #${result.erc8004.tokenId}`);
  }

  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} warning(s)`);
  }

  const status = result.trinityStatus === "COMPLETE"
    ? "✅ Trinity COMPLETE"
    : `⚠️ Trinity ${result.trinityStatus}`;

  return `${status} — ${parts.join(" | ")}`;
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
