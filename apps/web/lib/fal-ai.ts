const FAL_API_BASE = "https://fal.run";
const DEFAULT_MODEL = "fal-ai/flux/schnell";
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const TIMEOUT_MS = 15_000;

interface FalApiResponse {
  images?: Array<{ url: string; seed?: number }>;
  image?: { url: string; seed?: number };
  seed?: number;
}

interface GenerateImageOptions {
  width?: number;
  height?: number;
  model?: string;
}

/**
 * Generate an image via Fal.ai Flux Schnell.
 * Returns the image URL on success, or `null` on any failure.
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions,
): Promise<string | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.warn("[FAL] FAL_KEY not set, skipping image generation");
    return null;
  }

  const model = options?.model ?? DEFAULT_MODEL;
  const width = options?.width ?? 1024;
  const height = options?.height ?? 1024;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${FAL_API_BASE}/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: { width, height },
          num_images: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Fal.ai API error (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as FalApiResponse;
      const imageUrl = data.images?.[0]?.url ?? data.image?.url;

      if (!imageUrl) {
        throw new Error("No image URL in Fal.ai response");
      }

      return imageUrl;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[FAL] Attempt ${attempt + 1} failed: ${msg}`);

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }

  return null;
}
