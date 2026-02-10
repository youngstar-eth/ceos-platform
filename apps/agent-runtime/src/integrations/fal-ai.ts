import pino from 'pino';
import { logger as rootLogger } from '../config.js';

const FAL_API_BASE = 'https://fal.run';

export enum FalModel {
  FLUX_SCHNELL = 'fal-ai/flux/schnell',
  FLUX_PRO_ULTRA = 'fal-ai/flux-pro/v1.1-ultra',
  RECRAFT_V3 = 'fal-ai/recraft-v3',
}

export enum ImageStyle {
  PHOTOREALISTIC = 'photorealistic',
  DIGITAL_ART = 'digital-art',
  ANIME = 'anime',
  ABSTRACT = 'abstract',
}

interface GenerateImageOptions {
  width?: number;
  height?: number;
  style?: ImageStyle;
  numInferenceSteps?: number;
  guidanceScale?: number;
}

interface GenerateImageResult {
  url: string;
  seed: number;
  model: string;
}

const STYLE_PROMPT_MODIFIERS: Record<ImageStyle, string> = {
  [ImageStyle.PHOTOREALISTIC]: 'photorealistic, high quality, 4k, detailed',
  [ImageStyle.DIGITAL_ART]: 'digital art, vibrant colors, illustration',
  [ImageStyle.ANIME]: 'anime style, japanese animation, cel shaded',
  [ImageStyle.ABSTRACT]: 'abstract art, geometric, contemporary',
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const FALLBACK_ORDER: FalModel[] = [
  FalModel.FLUX_SCHNELL,
  FalModel.FLUX_PRO_ULTRA,
  FalModel.RECRAFT_V3,
];

interface FalApiResponse {
  images?: Array<{ url: string; seed?: number }>;
  image?: { url: string; seed?: number };
  seed?: number;
}

export class FalAiClient {
  private readonly apiKey: string;
  private readonly logger: pino.Logger;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.logger = rootLogger.child({ module: 'FalAiClient' });
  }

  async generateImage(
    prompt: string,
    model?: FalModel,
    options?: GenerateImageOptions,
  ): Promise<GenerateImageResult> {
    const primaryModel = model ?? FalModel.FLUX_SCHNELL;
    const modelsToTry = [primaryModel, ...FALLBACK_ORDER.filter((m) => m !== primaryModel)];

    let lastError: Error | null = null;

    for (const currentModel of modelsToTry) {
      try {
        const result = await this.tryGenerateWithRetries(prompt, currentModel, options);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          { model: currentModel, error: lastError.message },
          'Image model failed, trying fallback',
        );
      }
    }

    throw lastError ?? new Error('All image generation models failed');
  }

  private async tryGenerateWithRetries(
    prompt: string,
    model: FalModel,
    options?: GenerateImageOptions,
  ): Promise<GenerateImageResult> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.callFalApi(prompt, model, options);
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }

        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(
          { model, attempt: attempt + 1, delay },
          'Retrying image generation',
        );
        await this.sleep(delay);
      }
    }

    throw new Error(`Image generation failed after ${MAX_RETRIES} retries`);
  }

  private async callFalApi(
    prompt: string,
    model: FalModel,
    options?: GenerateImageOptions,
  ): Promise<GenerateImageResult> {
    const width = options?.width ?? 1024;
    const height = options?.height ?? 1024;

    const enhancedPrompt = options?.style
      ? `${prompt}, ${STYLE_PROMPT_MODIFIERS[options.style]}`
      : prompt;

    const body: Record<string, unknown> = {
      prompt: enhancedPrompt,
      image_size: { width, height },
      num_images: 1,
    };

    if (options?.numInferenceSteps) {
      body['num_inference_steps'] = options.numInferenceSteps;
    }

    if (options?.guidanceScale) {
      body['guidance_scale'] = options.guidanceScale;
    }

    this.logger.debug(
      { model, width, height, promptLength: enhancedPrompt.length },
      'Calling Fal.ai API',
    );

    const url = `${FAL_API_BASE}/${model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Fal.ai API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as FalApiResponse;

    const imageUrl = data.images?.[0]?.url ?? data.image?.url;
    const seed = data.images?.[0]?.seed ?? data.image?.seed ?? data.seed ?? 0;

    if (!imageUrl) {
      throw new Error('No image URL in Fal.ai response');
    }

    this.logger.info({ model, imageUrl, seed }, 'Image generated successfully');

    return {
      url: imageUrl,
      seed,
      model,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
