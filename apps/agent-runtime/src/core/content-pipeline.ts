import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import { OpenRouterClient } from '../integrations/openrouter.js';
import { FalAiClient } from '../integrations/fal-ai.js';
import { selectContentType, buildPrompt, type ContentStrategy } from '../strategies/posting.js';
import { ContentType } from './types.js';

export { ContentType };

interface GeneratedContent {
  text: string;
  mediaUrl?: string;
  type: ContentType;
  parts?: string[];
  model: string;
  tokensUsed: number;
}

interface AgentPersona {
  persona: string;
  name: string;
  agentId: string;
}

const CAST_MAX_LENGTH = 320;
const SPLIT_MARKER = '---SPLIT---';

export class ContentPipeline {
  private readonly openrouter: OpenRouterClient;
  private readonly falAi: FalAiClient;
  private readonly logger: pino.Logger;

  constructor(openrouter: OpenRouterClient, falAi: FalAiClient) {
    this.openrouter = openrouter;
    this.falAi = falAi;
    this.logger = rootLogger.child({ module: 'ContentPipeline' });
  }

  async generateContent(
    agentPersona: AgentPersona,
    strategy: ContentStrategy,
  ): Promise<GeneratedContent> {
    const contentType = selectContentType(strategy);
    this.logger.info({ agentId: agentPersona.agentId, contentType, strategy: strategy.name }, 'Generating content');

    const prompt = buildPrompt(agentPersona.persona, contentType);

    switch (contentType) {
      case ContentType.ORIGINAL:
        return this.generateOriginalContent(prompt, agentPersona);

      case ContentType.THREAD:
        return this.generateThreadContent(prompt, agentPersona);

      case ContentType.MEDIA:
        return this.generateMediaContent(prompt, agentPersona);

      case ContentType.ENGAGEMENT:
        return this.generateEngagementContent(prompt, agentPersona);

      default:
        return this.generateOriginalContent(prompt, agentPersona);
    }
  }

  private async generateOriginalContent(
    prompt: string,
    agentPersona: AgentPersona,
  ): Promise<GeneratedContent> {
    this.logger.debug({ agentId: agentPersona.agentId }, 'Generating original content');

    const result = await this.openrouter.generateText(prompt, {
      maxTokens: 200,
      temperature: 0.8,
    });

    const text = this.validateAndTrimText(result.text);

    // 50% chance to attach a complementary image
    const mediaUrl = await this.maybeGenerateImage(agentPersona, 0.5);

    return {
      text,
      mediaUrl,
      type: ContentType.ORIGINAL,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  private async generateThreadContent(
    prompt: string,
    agentPersona: AgentPersona,
  ): Promise<GeneratedContent> {
    this.logger.debug({ agentId: agentPersona.agentId }, 'Generating thread content');

    const threadPrompt = `${prompt}\n\nIMPORTANT: Write a multi-part thread. Separate each part with "${SPLIT_MARKER}". Each part must be under ${CAST_MAX_LENGTH} characters. Write 3-5 parts.`;

    const result = await this.openrouter.generateText(threadPrompt, {
      maxTokens: 800,
      temperature: 0.8,
    });

    const parts = this.splitThread(result.text);
    const text = parts[0] ?? result.text;

    // 40% chance to attach a cover image to the thread
    const mediaUrl = await this.maybeGenerateImage(agentPersona, 0.4);

    return {
      text,
      mediaUrl,
      type: ContentType.THREAD,
      parts,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  private async generateMediaContent(
    prompt: string,
    agentPersona: AgentPersona,
  ): Promise<GeneratedContent> {
    this.logger.debug({ agentId: agentPersona.agentId }, 'Generating media content');

    const [textResult, imageDescriptionResult] = await Promise.all([
      this.openrouter.generateText(prompt, {
        maxTokens: 150,
        temperature: 0.8,
      }),
      this.openrouter.generateText(
        `Based on this persona: "${agentPersona.persona}", generate a concise image description (one sentence, max 50 words) for an engaging social media image. Output ONLY the image description, nothing else.`,
        { maxTokens: 80, temperature: 0.9 },
      ),
    ]);

    const text = this.validateAndTrimText(textResult.text);

    let mediaUrl: string | undefined;
    try {
      const imageResult = await this.falAi.generateImage(imageDescriptionResult.text.trim());
      mediaUrl = imageResult.url;
      this.logger.info({ agentId: agentPersona.agentId, mediaUrl }, 'Image generated');
    } catch (error) {
      this.logger.warn(
        { agentId: agentPersona.agentId, error: error instanceof Error ? error.message : String(error) },
        'Image generation failed, publishing text only',
      );
    }

    return {
      text,
      mediaUrl,
      type: ContentType.MEDIA,
      model: textResult.model,
      tokensUsed: textResult.tokensUsed + imageDescriptionResult.tokensUsed,
    };
  }

  private async generateEngagementContent(
    prompt: string,
    agentPersona: AgentPersona,
  ): Promise<GeneratedContent> {
    this.logger.debug({ agentId: agentPersona.agentId }, 'Generating engagement content');

    const result = await this.openrouter.generateText(prompt, {
      maxTokens: 150,
      temperature: 0.9,
    });

    const text = this.validateAndTrimText(result.text);

    // 40% chance to attach a complementary image
    const mediaUrl = await this.maybeGenerateImage(agentPersona, 0.4);

    return {
      text,
      mediaUrl,
      type: ContentType.ENGAGEMENT,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  private splitThread(rawText: string): string[] {
    let parts: string[];

    if (rawText.includes(SPLIT_MARKER)) {
      parts = rawText
        .split(SPLIT_MARKER)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    } else {
      parts = this.autoSplitByLength(rawText);
    }

    return parts.map((part) => this.validateAndTrimText(part));
  }

  private autoSplitByLength(text: string): string[] {
    if (text.length <= CAST_MAX_LENGTH) {
      return [text];
    }

    const parts: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentPart = '';

    for (const sentence of sentences) {
      if (currentPart.length + sentence.length + 1 > CAST_MAX_LENGTH) {
        if (currentPart.length > 0) {
          parts.push(currentPart.trim());
          currentPart = '';
        }

        if (sentence.length > CAST_MAX_LENGTH) {
          const words = sentence.split(' ');
          for (const word of words) {
            if (currentPart.length + word.length + 1 > CAST_MAX_LENGTH) {
              parts.push(currentPart.trim());
              currentPart = '';
            }
            currentPart += (currentPart.length > 0 ? ' ' : '') + word;
          }
        } else {
          currentPart = sentence;
        }
      } else {
        currentPart += (currentPart.length > 0 ? ' ' : '') + sentence;
      }
    }

    if (currentPart.trim().length > 0) {
      parts.push(currentPart.trim());
    }

    return parts;
  }

  /**
   * Optionally generate a complementary image based on probability.
   * Returns the image URL or undefined if skipped/failed.
   */
  private async maybeGenerateImage(
    agentPersona: AgentPersona,
    probability: number,
  ): Promise<string | undefined> {
    if (Math.random() > probability) {
      return undefined;
    }

    this.logger.info({ agentId: agentPersona.agentId, probability }, 'Generating complementary image');

    try {
      const descriptionResult = await this.openrouter.generateText(
        `Based on this persona: "${agentPersona.persona}", generate a concise image description (one sentence, max 50 words) for an engaging social media image. The image should be visually striking, modern, and related to the persona's expertise. Output ONLY the image description, nothing else.`,
        { maxTokens: 80, temperature: 0.9 },
      );

      const imageResult = await this.falAi.generateImage(descriptionResult.text.trim());
      this.logger.info({ agentId: agentPersona.agentId, mediaUrl: imageResult.url }, 'Complementary image generated');
      return imageResult.url;
    } catch (error) {
      this.logger.warn(
        { agentId: agentPersona.agentId, error: error instanceof Error ? error.message : String(error) },
        'Complementary image generation failed, continuing without image',
      );
      return undefined;
    }
  }

  private validateAndTrimText(text: string): string {
    let cleaned = text.trim();

    // Remove any wrapping quotes
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // Truncate to max cast length
    if (cleaned.length > CAST_MAX_LENGTH) {
      cleaned = cleaned.slice(0, CAST_MAX_LENGTH - 3) + '...';
    }

    // Basic quality check
    if (cleaned.length < 5) {
      this.logger.warn({ text: cleaned }, 'Generated text is too short, may be low quality');
    }

    return cleaned;
  }
}

export type { GeneratedContent, AgentPersona };
