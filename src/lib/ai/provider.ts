import { AIProvider } from '@/types';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  /** Normalized: 'end_turn' (natural stop) | 'max_tokens' (truncated) | 'stop_sequence' | 'other' */
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'other';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

export interface ChatOptions {
  temperature?: number;
  /** Output token limit. Default 4096. Claude supports up to 8192+, GLM-4-Flash capped at 4096. */
  maxTokens?: number;
  /** When true, marks the system prompt as cacheable (Claude only; ignored elsewhere). */
  cacheSystemPrompt?: boolean;
}

export interface AIProviderAdapter {
  chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
  stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;
}

export interface ProviderOptions {
  /** When true, call from a browser: adds the Anthropic browser-access header. */
  browser?: boolean;
}

export function getAIProvider(
  provider: AIProvider,
  apiKey: string,
  model?: string,
  options?: ProviderOptions,
): AIProviderAdapter {
  switch (provider) {
    case 'claude':
      return new ClaudeAdapter(apiKey, model || 'claude-sonnet-4-20250514', !!options?.browser);
    case 'openai':
      return new OpenAICompatibleAdapter(apiKey, model || 'gpt-4o', 'https://api.openai.com/v1/chat/completions');
    case 'gemini':
      return new OpenAICompatibleAdapter(apiKey, model || 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    case 'minimax':
      return new OpenAICompatibleAdapter(apiKey, model || 'MiniMax-Text-01', 'https://api.minimax.chat/v1/text/chatcompletion_v2');
    case 'zhipu':
      return new OpenAICompatibleAdapter(apiKey, model || 'glm-4-flash', 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

class ClaudeAdapter implements AIProviderAdapter {
  constructor(private apiKey: string, private model: string, private browser: boolean = false) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (this.browser) h['anthropic-dangerous-direct-browser-access'] = 'true';
    return h;
  }

  /** Build the `system` field. Returns array form (for cache_control) when caching enabled, else plain string. */
  private buildSystem(systemContent: string, cache: boolean): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    if (!systemContent) return '';
    if (!cache) return systemContent;
    return [{ type: 'text', text: systemContent, cache_control: { type: 'ephemeral' } }];
  }

  private mapStopReason(raw: unknown): AIResponse['stopReason'] {
    if (raw === 'end_turn') return 'end_turn';
    if (raw === 'max_tokens') return 'max_tokens';
    if (raw === 'stop_sequence') return 'stop_sequence';
    return 'other';
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        system: this.buildSystem(systemMessage?.content || '', !!options?.cacheSystemPrompt),
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      model: data.model,
      stopReason: this.mapStopReason(data.stop_reason),
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
      },
    };
  }

  async *stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        system: this.buildSystem(systemMessage?.content || '', !!options?.cacheSystemPrompt),
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

class OpenAICompatibleAdapter implements AIProviderAdapter {
  constructor(private apiKey: string, private model: string, private baseUrl: string = 'https://api.openai.com/v1/chat/completions') {}

  private mapStopReason(raw: unknown): AIResponse['stopReason'] {
    if (raw === 'stop') return 'end_turn';
    if (raw === 'length') return 'max_tokens';
    if (raw === 'stop_sequence') return 'stop_sequence';
    return 'other';
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: options?.temperature ?? 0.7,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error (${this.model}): ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      stopReason: this.mapStopReason(data.choices?.[0]?.finish_reason),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: options?.temperature ?? 0.7,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
        stream: true,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`API error (${this.model}): ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}
