import type { ChatMessage, CompletionRequest, CompletionResult, LlmClient } from './gateway.js';

export interface OpenAiCompatibleClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Minimal OpenAI-compatible chat-completions client (works with any compatible gateway) */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(private readonly options: OpenAiCompatibleClientOptions) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const baseUrl = (this.options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 120_000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: [{ role: 'system', content: req.system }, ...req.messages],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        text,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        model: req.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type { ChatMessage };
