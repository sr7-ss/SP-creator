/**
 * Direct-from-browser AI call.
 *
 * Only used when the user has enabled privacy mode. Reads the user's API key
 * from local settings, calls the provider endpoint directly, and returns the
 * text response. Our server is never in the request path.
 */

import { getAIProvider, type AIMessage } from './provider';
import { loadSettings, getConfigForTask } from '@/lib/settings';

export class MissingApiKeyError extends Error {
  constructor() {
    super('No API key configured for this task');
    this.name = 'MissingApiKeyError';
  }
}

export interface ClientCallOptions {
  temperature?: number;
}

export async function callAIClient(
  task: string,
  messages: AIMessage[],
  options?: ClientCallOptions,
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('callAIClient is browser-only');
  }
  const settings = loadSettings();
  const config = getConfigForTask(settings, task);
  if (!config.apiKey) throw new MissingApiKeyError();

  const provider = getAIProvider(config.provider, config.apiKey, config.model, { browser: true });
  const res = await provider.chat(messages, options);
  return res.content;
}

/** Whether the user currently has privacy mode enabled. */
export function isPrivacyModeOn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!loadSettings().privacyMode;
}
