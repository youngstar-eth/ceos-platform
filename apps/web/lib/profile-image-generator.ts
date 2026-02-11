import { generateImage } from "@/lib/fal-ai";

interface AgentProfileContext {
  name: string;
  description: string | null;
  persona: Record<string, unknown>;
  skills: string[];
}

interface GeneratedProfileImages {
  pfpUrl: string | null;
  bannerUrl: string | null;
}

/**
 * Generate a profile picture and banner image for an agent.
 * Both images are generated in parallel. Individual failures
 * do not affect each other and never block deployment.
 */
export async function generateAgentProfileImages(
  agent: AgentProfileContext,
): Promise<GeneratedProfileImages> {
  const pfpPrompt = buildPfpPrompt(agent);
  const bannerPrompt = buildBannerPrompt(agent);

  const [pfpResult, bannerResult] = await Promise.allSettled([
    generateImage(pfpPrompt, { width: 512, height: 512 }),
    generateImage(bannerPrompt, { width: 1536, height: 512 }),
  ]);

  const pfpUrl = pfpResult.status === "fulfilled" ? pfpResult.value : null;
  const bannerUrl = bannerResult.status === "fulfilled" ? bannerResult.value : null;

  return { pfpUrl, bannerUrl };
}

function buildPfpPrompt(agent: AgentProfileContext): string {
  const tone = String(agent.persona.tone ?? "");
  const style = String(agent.persona.style ?? "");
  const topics = Array.isArray(agent.persona.topics)
    ? (agent.persona.topics as string[]).slice(0, 5).join(", ")
    : "";

  const descSnippet = agent.description
    ? agent.description.slice(0, 80)
    : "";

  const traits = [tone, style].filter(Boolean).join(", ").slice(0, 100);

  return [
    "A professional avatar icon for an AI agent.",
    descSnippet && `Theme: ${descSnippet}.`,
    traits && `Personality: ${traits}.`,
    topics && `Topics: ${topics}.`,
    "Style: modern, clean, digital art, vibrant gradient colors, abstract robot or geometric mascot.",
    "Centered composition, solid dark background, suitable for a social media profile picture.",
    "IMPORTANT: absolutely no text, no words, no letters, no numbers, no watermarks, no names anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBannerPrompt(agent: AgentProfileContext): string {
  const tone = String(agent.persona.tone ?? "");
  const style = String(agent.persona.style ?? "");
  const topics = Array.isArray(agent.persona.topics)
    ? (agent.persona.topics as string[]).slice(0, 5).join(", ")
    : "";

  return [
    "A wide panoramic banner image for a social media profile.",
    topics && `Theme: ${topics}.`,
    tone && `Mood: ${tone.slice(0, 60)}.`,
    style && `Style: ${style.slice(0, 60)},`,
    "modern digital art, abstract elements, cinematic composition, gradient colors, professional look.",
    "Dark background with vibrant accents.",
    "No text, no words, no letters, no logos, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}
