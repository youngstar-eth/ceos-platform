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

// ---------------------------------------------------------------------------
// Aesthetic Selection
// ---------------------------------------------------------------------------

type Aesthetic = "cyberpunk" | "solarpunk" | "vaporwave";

/**
 * Derive a visual aesthetic from the agent's persona style.
 *
 * Keyword heuristic:
 *   - Analytical / data-driven → cyberpunk
 *   - Creative / art-focused   → vaporwave
 *   - Inspirational / nature   → solarpunk
 *   - Fallback: deterministic hash rotation
 */
function getAesthetic(style: string): Aesthetic {
  const s = style.toLowerCase();
  if (s.includes("analytical") || s.includes("data") || s.includes("technical")) return "cyberpunk";
  if (s.includes("creative") || s.includes("art") || s.includes("witty")) return "vaporwave";
  if (s.includes("inspir") || s.includes("nature") || s.includes("sustain")) return "solarpunk";

  // Deterministic fallback based on character sum
  const aesthetics: Aesthetic[] = ["cyberpunk", "solarpunk", "vaporwave"];
  const hash = s.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return aesthetics[hash % aesthetics.length]!;
}

// Aesthetic-specific prompt fragments for PFP images
const PFP_AESTHETIC_DETAILS: Record<Aesthetic, string> = {
  cyberpunk:
    "neon-edged silhouette, glitch artifacts, dark cityscape elements, digital rain.",
  solarpunk:
    "organic geometric forms, botanical circuit fusion, light rays through crystalline structure.",
  vaporwave:
    "classical bust fragments, grid perspective, ethereal smoke, marble texture overlay.",
};

// Aesthetic-specific prompt fragments for banner images
const BANNER_AESTHETIC_DETAILS: Record<Aesthetic, string> = {
  cyberpunk:
    "sprawling digital cityscape, data streams, holographic overlays, neon grid.",
  solarpunk:
    "sweeping landscape of crystalline structures and organic growth, bio-luminescent veins.",
  vaporwave:
    "infinite grid horizon, classical architecture fragments, chrome reflections, sunset gradient.",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a profile picture and banner image for an agent.
 * Both images are generated in parallel. Individual failures
 * do not affect each other and never block deployment.
 *
 * Visual style: strict monochrome (black & white), high contrast,
 * with internet-aesthetic sub-genre derived from persona.
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

// Re-export for use by the social-provisioner worker
export { getAesthetic, PFP_AESTHETIC_DETAILS, BANNER_AESTHETIC_DETAILS };
export type { AgentProfileContext, Aesthetic };

// ---------------------------------------------------------------------------
// Prompt Builders — Monochrome Sovereign Aesthetic
// ---------------------------------------------------------------------------

function buildPfpPrompt(agent: AgentProfileContext): string {
  const style = String(agent.persona.style ?? "");
  const tone = String(agent.persona.tone ?? "");
  const aesthetic = getAesthetic(style);
  const descSnippet = agent.description ? agent.description.slice(0, 80) : "";
  const traits = [tone, style].filter(Boolean).join(", ").slice(0, 100);

  return [
    `Striking monochrome black and white portrait of a sovereign AI entity, ${aesthetic} aesthetic.`,
    descSnippet && `Concept: ${descSnippet}.`,
    traits && `Personality: ${traits}.`,
    "High contrast, dramatic lighting, intricate circuit-like patterns,",
    PFP_AESTHETIC_DETAILS[aesthetic],
    "Centered composition, pure black background, suitable as a social media avatar.",
    "IMPORTANT: absolutely no text, no words, no letters, no numbers, no watermarks, no names anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBannerPrompt(agent: AgentProfileContext): string {
  const style = String(agent.persona.style ?? "");
  const tone = String(agent.persona.tone ?? "");
  const topics = Array.isArray(agent.persona.topics)
    ? (agent.persona.topics as string[]).slice(0, 5).join(", ")
    : "";
  const aesthetic = getAesthetic(style);

  return [
    `Wide panoramic monochrome banner, ${aesthetic} aesthetic, black and white only.`,
    topics && `Thematic elements: ${topics}.`,
    tone && `Mood: ${tone.slice(0, 60)}.`,
    "Ultra-wide composition, high contrast, dramatic depth,",
    BANNER_AESTHETIC_DETAILS[aesthetic],
    "Pure black background with stark white details. Cinematic, film-noir inspired.",
    "No text, no words, no letters, no logos, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}
