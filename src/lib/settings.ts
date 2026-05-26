import { AIProvider, AI_PROVIDER_META, TaskCategory } from '@/types';

const STORAGE_KEY = 'ksp-assistant-settings-v2';

export interface ProviderConfig {
  apiKey: string;
  model?: string;
}

export interface TaskRouteConfig {
  provider: AIProvider;
  model: string;
}

export interface AppSettings {
  aiProviders: Partial<Record<AIProvider, ProviderConfig>>;
  activeProvider: AIProvider;
  activeModel?: string;
  locale: 'en' | 'zh';
  taskRouting?: Partial<Record<TaskCategory, TaskRouteConfig>>;
  brandNamingRules?: string[]; // 品牌命名规则，生成时强制引用
  privacyMode?: boolean; // 开启后本地优先，禁用服务端存储用户内容
  analyticsOptIn?: boolean; // 匿名行为统计（隐私模式下强制关）
}

function defaultSettings(): AppSettings {
  return {
    aiProviders: {},
    activeProvider: 'claude',
    activeModel: '',
    locale: 'en',
    privacyMode: false,
    analyticsOptIn: false,
  };
}

/** Migrate from old localStorage formats */
function migrateOldSettings(): AppSettings {
  const settings = defaultSettings();

  // Try old combined key
  try {
    const old = localStorage.getItem('ksp-assistant-settings');
    if (old) {
      const parsed = JSON.parse(old);
      if (parsed.aiProvider && parsed.apiKey) {
        settings.activeProvider = parsed.aiProvider;
        settings.aiProviders[parsed.aiProvider as AIProvider] = {
          apiKey: parsed.apiKey,
          model: parsed.model || undefined,
        };
      }
      if (parsed.locale) settings.locale = parsed.locale;
      localStorage.removeItem('ksp-assistant-settings');
    }
  } catch {}

  // Try old individual keys
  try {
    const provider = localStorage.getItem('sp-ai-provider');
    const apiKey = localStorage.getItem('sp-api-key');
    const model = localStorage.getItem('sp-ai-model');
    if (apiKey) {
      const p = (provider || 'claude') as AIProvider;
      settings.activeProvider = p;
      settings.aiProviders[p] = { apiKey, model: model || undefined };
      localStorage.removeItem('sp-ai-provider');
      localStorage.removeItem('sp-api-key');
      localStorage.removeItem('sp-ai-model');
    }
  } catch {}

  // Try locale
  try {
    const locale = localStorage.getItem('sp-locale');
    if (locale) settings.locale = locale as 'en' | 'zh';
  } catch {}

  // Save migrated
  saveSettings(settings);
  return settings;
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return migrateOldSettings();
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  // Keep locale in sync for AppProvider
  localStorage.setItem('sp-locale', settings.locale);
}

/** Providers that support Anthropic Messages protocol (for Agent mode) */
export const ANTHROPIC_COMPATIBLE: Set<AIProvider> = new Set(['claude', 'zhipu', 'kimi', 'minimax'] as AIProvider[]);

/**
 * Get the best Anthropic-compatible AI config from user's settings.
 * Checks active provider first, then falls back to any configured compatible provider.
 * Returns null if no compatible provider is configured.
 */
export function getAnthropicCompatibleConfig(settings: AppSettings): { provider: AIProvider; apiKey: string; model: string } | null {
  // Try active provider first
  if (ANTHROPIC_COMPATIBLE.has(settings.activeProvider)) {
    const config = getActiveAIConfig(settings);
    if (config.apiKey) return config;
  }

  // Search all configured providers for a compatible one
  for (const [provider, config] of Object.entries(settings.aiProviders)) {
    if (ANTHROPIC_COMPATIBLE.has(provider as AIProvider) && config?.apiKey) {
      const meta = AI_PROVIDER_META[provider as AIProvider];
      return {
        provider: provider as AIProvider,
        apiKey: config.apiKey,
        model: config.model || meta?.defaultModel || '',
      };
    }
  }

  return null;
}

/** Preferred order for Anthropic-compatible fallback: free/cheap first */
const ANTHROPIC_FALLBACK_ORDER: AIProvider[] = ['zhipu', 'kimi', 'minimax', 'claude'] as AIProvider[];

/**
 * Get AI config for an Agent task, respecting task routing.
 * Agents require Anthropic-compatible providers.
 *
 * Resolution order:
 * 1. Explicit task routing (if user configured it in settings)
 * 2. Cheapest available Anthropic-compatible provider (zhipu > kimi > minimax > claude)
 *    — Agent tasks are multi-turn and token-heavy, prefer free models by default
 */
export function getAgentConfigForTask(
  settings: AppSettings,
  agentType: string
): { provider: AIProvider; apiKey: string; model: string } | null {
  const taskKey = `agent-${agentType}`;
  const category = TASK_CATEGORY_MAP[taskKey];
  const routing = category ? settings.taskRouting?.[category] : undefined;

  // 1. Explicit routing configured → use it (if compatible)
  if (routing) {
    const providerConfig = settings.aiProviders[routing.provider];
    if (providerConfig?.apiKey && ANTHROPIC_COMPATIBLE.has(routing.provider)) {
      const meta = AI_PROVIDER_META[routing.provider];
      return {
        provider: routing.provider,
        apiKey: providerConfig.apiKey,
        model: routing.model || meta?.defaultModel || '',
      };
    }
  }

  // 2. No routing → pick cheapest available compatible provider
  for (const provider of ANTHROPIC_FALLBACK_ORDER) {
    const providerConfig = settings.aiProviders[provider];
    if (providerConfig?.apiKey) {
      const meta = AI_PROVIDER_META[provider];
      return {
        provider,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model || meta?.defaultModel || '',
      };
    }
  }

  return null;
}

/** Maps each AI task to its routing category */
const TASK_CATEGORY_MAP: Record<string, TaskCategory> = {
  'parse-params': 'light',
  'agent-orchestration': 'light',
  'analyze': 'analysis',
  'sp-tier': 'analysis',
  'packaging': 'creative',
  'agent-packaging': 'creative',
  'review-analysis': 'analysis',
  // Agent types → routing categories
  'agent-discovery': 'light',
  'agent-research': 'research',
  'agent-reviews': 'analysis',
  'agent-creative': 'creative',
};

/**
 * Get AI config for a specific task, respecting per-category routing.
 * Falls back to activeProvider if no routing is configured for the task's category.
 */
export function getConfigForTask(
  settings: AppSettings,
  task: string
): { provider: AIProvider; apiKey: string; model: string } {
  const category = TASK_CATEGORY_MAP[task];
  const routing = category ? settings.taskRouting?.[category] : undefined;

  if (routing) {
    const providerConfig = settings.aiProviders[routing.provider];
    const meta = AI_PROVIDER_META[routing.provider];
    return {
      provider: routing.provider,
      apiKey: providerConfig?.apiKey || '',
      model: routing.model || meta?.defaultModel || '',
    };
  }

  return getActiveAIConfig(settings);
}

export function getActiveAIConfig(settings: AppSettings) {
  const providerConfig = settings.aiProviders[settings.activeProvider];
  const meta = AI_PROVIDER_META[settings.activeProvider];
  const defaultModel = meta?.defaultModel || '';
  const validModels = meta?.models || [];

  // Resolve the model, falling back through the chain
  let model = settings.activeModel || providerConfig?.model || defaultModel;

  // If the stored model is not in the current valid list, reset to default
  if (model && validModels.length > 0 && !validModels.includes(model)) {
    model = defaultModel;
  }

  return {
    provider: settings.activeProvider,
    apiKey: providerConfig?.apiKey || '',
    model,
  };
}
