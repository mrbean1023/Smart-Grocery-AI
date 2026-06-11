import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { MetricsService } from '../metrics/metrics.service';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const REQUEST_TIMEOUT_MS = 60_000;
const EMBED_BATCH_SIZE = 100;
const EMBED_MAX_ATTEMPTS = 3;

export interface ChatTextOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatJsonOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface VisionTextOptions {
  imageBase64?: string;
  imageUrl?: string;
  mime?: string;
  prompt: string;
  maxTokens?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolLoopOptions {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxRounds?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status?: unknown }).status === 429
  );
}

/**
 * The single OpenAI wrapper for the whole application.
 * All other services (pricing agents, assistant, OCR fallback, recipe
 * structuring) must go through this service instead of instantiating
 * their own SDK clients.
 */
@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI | null;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(private readonly metrics: MetricsService) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey
      ? new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 })
      : null;
    this.chatModel = process.env.OPENAI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY is not set — AI features are disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new ServiceUnavailableException('AI features require OPENAI_API_KEY');
    }
    return this.client;
  }

  private async instrument<T>(method: string, fn: () => Promise<T>): Promise<T> {
    this.metrics.increment('ai_requests_total', { method });
    const started = Date.now();
    try {
      return await fn();
    } finally {
      this.metrics.observeHistogram('ai_request_duration_ms', Date.now() - started, { method });
    }
  }

  async chatText(opts: ChatTextOptions): Promise<string> {
    const client = this.requireClient();
    return this.instrument('chatText', async () => {
      const response = await client.chat.completions.create({
        model: this.chatModel,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      });
      return response.choices[0]?.message?.content ?? '';
    });
  }

  async chatJson<T>(opts: ChatJsonOptions): Promise<T> {
    const client = this.requireClient();
    return this.instrument('chatJson', async () => {
      const request = async (nudge?: string): Promise<string> => {
        const response = await client.chat.completions.create({
          model: this.chatModel,
          temperature: 0,
          max_tokens: opts.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: nudge ? `${opts.user}\n\n${nudge}` : opts.user },
          ],
        });
        return response.choices[0]?.message?.content ?? '';
      };

      const first = await request();
      try {
        return JSON.parse(first) as T;
      } catch {
        this.logger.warn('AI returned non-JSON payload; retrying once');
      }

      const second = await request('Your previous answer was not valid JSON. Respond with ONLY a single valid JSON object and nothing else.');
      try {
        return JSON.parse(second) as T;
      } catch {
        throw new BadGatewayException('AI model returned invalid JSON after retry');
      }
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const client = this.requireClient();
    if (texts.length === 0) return [];
    return this.instrument('embed', async () => {
      const vectors: number[][] = [];
      for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
        const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
        let lastError: unknown = null;
        let done = false;
        for (let attempt = 1; attempt <= EMBED_MAX_ATTEMPTS && !done; attempt++) {
          try {
            const response = await client.embeddings.create({
              model: this.embeddingModel,
              input: batch,
            });
            const sorted = [...response.data].sort((a, b) => a.index - b.index);
            for (const item of sorted) vectors.push(item.embedding);
            done = true;
          } catch (err) {
            lastError = err;
            if (isRateLimitError(err) && attempt < EMBED_MAX_ATTEMPTS) {
              const delayMs = 1000 * 2 ** (attempt - 1);
              this.logger.warn(`Embedding batch rate-limited (attempt ${attempt}); retrying in ${delayMs}ms`);
              await sleep(delayMs);
            } else {
              throw err;
            }
          }
        }
        if (!done) {
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }
      }
      return vectors;
    });
  }

  async visionText(opts: VisionTextOptions): Promise<string> {
    const client = this.requireClient();
    if (!opts.imageBase64 && !opts.imageUrl) {
      throw new BadRequestException('visionText requires imageBase64 or imageUrl');
    }
    return this.instrument('visionText', async () => {
      const url = opts.imageUrl
        ? opts.imageUrl
        : `data:${opts.mime ?? 'image/jpeg'};base64,${opts.imageBase64}`;
      const content: ChatCompletionContentPart[] = [
        { type: 'text', text: opts.prompt },
        { type: 'image_url', image_url: { url } },
      ];
      const response = await client.chat.completions.create({
        model: this.chatModel,
        max_tokens: opts.maxTokens ?? 2000,
        messages: [{ role: 'user', content }],
      });
      return response.choices[0]?.message?.content ?? '';
    });
  }

  async toolLoop(opts: ToolLoopOptions): Promise<string> {
    const client = this.requireClient();
    return this.instrument('toolLoop', async () => {
      const maxRounds = opts.maxRounds ?? 5;
      const tools: ChatCompletionTool[] = opts.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: opts.system },
        ...opts.messages.map(
          (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
        ),
      ];

      for (let round = 0; round < maxRounds; round++) {
        const response = await client.chat.completions.create({
          model: this.chatModel,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });
        const message = response.choices[0]?.message;
        if (!message) {
          throw new BadGatewayException('AI model returned an empty response');
        }
        if (message.tool_calls && message.tool_calls.length > 0) {
          messages.push(message);
          for (const call of message.tool_calls) {
            if (call.type !== 'function') continue;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
            } catch {
              this.logger.warn(`Unparseable tool arguments for ${call.function.name}`);
            }
            let result: string;
            try {
              result = await opts.executeTool(call.function.name, args);
            } catch (err) {
              result = `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: result });
          }
          continue;
        }
        return message.content ?? '';
      }

      // Round budget exhausted — force a final text answer without tools.
      const finalResponse = await client.chat.completions.create({
        model: this.chatModel,
        messages,
      });
      return finalResponse.choices[0]?.message?.content ?? '';
    });
  }
}
