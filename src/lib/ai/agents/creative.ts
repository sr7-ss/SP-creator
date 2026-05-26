/**
 * Creative Exploration Agent
 *
 * Generates multiple L2 slogan variants for a SP item,
 * self-evaluates them against brand rules and competitor messaging,
 * and recommends the best option with reasoning.
 */

import type { AgentRunnerConfig, AgentToolDef, AgentContext } from '@/lib/ai/agent-runner';
import { prisma } from '@/lib/db/client';
import { SLOGAN_GENERATION_RULES } from '@/lib/constants/slogan-rules';
import { getAIProvider } from '@/lib/ai/provider';
import { safeJsonParse } from '@/lib/ai/packaging-core';
import type { AIProvider } from '@/types';

// ─── Tool: generate_variants ───────────────────────────────────

interface GenerateVariantsInput {
  featureName: string;
  paramValue: string;
  tier: number;
  productName: string;
  segment?: string;
}

interface SloganVariant {
  text: string;
  type: 'factual' | 'functional' | 'emotional';
  rationale: string;
}

const generateVariantsTool: AgentToolDef = {
  definition: {
    name: 'generate_variants',
    description:
      'Generate 4-5 L2 slogan variants with different creative approaches for a SP feature. Each variant has text, type (factual/functional/emotional), and a brief rationale.',
    input_schema: {
      type: 'object' as const,
      properties: {
        featureName: { type: 'string', description: 'Parameter/feature name' },
        paramValue: { type: 'string', description: 'Parameter value' },
        tier: { type: 'number', description: 'SP tier (1/2/3)' },
        productName: { type: 'string', description: 'Product name' },
        segment: { type: 'string', description: 'Market segment (optional)' },
      },
      required: ['featureName', 'paramValue', 'tier', 'productName'],
    },
  },
  handler: async (rawInput: unknown, context: AgentContext): Promise<string> => {
    const input = rawInput as GenerateVariantsInput;
    context.onProgress({ step: 'generate_variants', detail: `Generating slogan variants for "${input.featureName}"`, progress: 0.15 });

    const locale = context.locale || 'en';
    const lang = locale === 'zh' ? '中文' : 'English';
    const brandRules = context.data.brandRules as string[] | undefined;
    const brandBlock = brandRules?.length
      ? `\nBrand rules to follow:\n${brandRules.map(r => `- ${r}`).join('\n')}\n`
      : '';

    const prompt = `Generate exactly 5 L2 slogan variants for this SP feature.
Product: ${input.productName}${input.segment ? ` (${input.segment} segment)` : ''}
Feature: ${input.featureName}
Value: ${input.paramValue}
Tier: T${input.tier}

${SLOGAN_GENERATION_RULES}
${brandBlock}

Create 5 variants covering different approaches:
1. A factual variant (highlight the raw spec advantage)
2. A functional variant (translate spec into user benefit)
3. An emotional variant (evoke feeling or aspiration)
4. A creative/unexpected angle
5. A concise punchy variant (shortest possible)

Respond in ${lang}. Output ONLY valid JSON:
{ "variants": [{ "text": "...", "type": "factual|functional|emotional", "rationale": "brief explanation of the approach" }] }`;

    const provider = getAIProvider(context.provider as AIProvider, context.apiKey, context.model);
    const response = await provider.chat([
      { role: 'system', content: 'You are a creative marketing copywriter for consumer electronics.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = safeJsonParse(response.content) as { variants?: SloganVariant[] };
    const variants = parsed?.variants || [];
    return JSON.stringify({ variants });
  },
};

// ─── Tool: evaluate_variants ───────────────────────────────────

interface EvaluateVariantsInput {
  variants: Array<{ text: string; type: string }>;
  brandRules?: string[];
}

interface ScoredVariant {
  text: string;
  type: string;
  score: number;
  issues: string[];
  strengths: string[];
}

const evaluateVariantsTool: AgentToolDef = {
  definition: {
    name: 'evaluate_variants',
    description:
      'Score each slogan variant (1-10) against quality rules, brand naming rules, clarity and impact. Returns scored variants with issues identified.',
    input_schema: {
      type: 'object' as const,
      properties: {
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string' },
            },
          },
          description: 'Array of slogan variants to evaluate',
        },
        brandRules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Brand naming rules to check against (optional)',
        },
      },
      required: ['variants'],
    },
  },
  handler: async (rawInput: unknown, context: AgentContext): Promise<string> => {
    const input = rawInput as EvaluateVariantsInput;
    context.onProgress({ step: 'evaluate_variants', detail: `Evaluating ${input.variants.length} variants`, progress: 0.45 });

    const locale = context.locale || 'en';
    const lang = locale === 'zh' ? '中文' : 'English';
    const brandRules = input.brandRules || (context.data.brandRules as string[] | undefined) || [];
    const brandBlock = brandRules.length
      ? `\nBrand naming rules:\n${brandRules.map(r => `- ${r}`).join('\n')}\n`
      : '';

    const prompt = `Critically evaluate each slogan variant on a scale of 1-10.

Evaluation criteria:
1. Concrete > Abstract (does it use specific, tangible language?)
2. Benefit-focused (does the user immediately understand the value?)
3. Memorable (would this stick in someone's mind?)
4. Clarity (is it immediately understandable?)
5. Impact (does it create a strong impression?)
${brandBlock}

Variants to evaluate:
${input.variants.map((v, i) => `${i + 1}. [${v.type}] "${v.text}"`).join('\n')}

Respond in ${lang}. Output ONLY valid JSON:
{ "scored": [{ "text": "...", "type": "...", "score": 8, "issues": ["issue1"], "strengths": ["strength1"] }] }
Rate honestly — not every variant should score high.`;

    const provider = getAIProvider(context.provider as AIProvider, context.apiKey, context.model);
    const response = await provider.chat([
      { role: 'system', content: 'You are a strict marketing quality reviewer. Be critical and honest.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = safeJsonParse(response.content) as { scored?: ScoredVariant[] };
    const scored = parsed?.scored || [];
    return JSON.stringify({ scored });
  },
};

// ─── Tool: search_knowledge_base ───────────────────────────────

interface SearchKnowledgeInput {
  featureName: string;
  category?: string;
}

const searchKnowledgeBaseTool: AgentToolDef = {
  definition: {
    name: 'search_knowledge_base',
    description:
      'Search the knowledge base for relevant past packaging examples and brand rules. Returns matching entries for reference.',
    input_schema: {
      type: 'object' as const,
      properties: {
        featureName: { type: 'string', description: 'Feature name to search for' },
        category: { type: 'string', description: 'Category filter (optional, defaults to packaging)' },
      },
      required: ['featureName'],
    },
  },
  handler: async (rawInput: unknown, context: AgentContext): Promise<string> => {
    const input = rawInput as SearchKnowledgeInput;
    context.onProgress({ step: 'search_knowledge_base', detail: `Searching knowledge base for "${input.featureName}"`, progress: 0.3 });

    try {
      // Search both Knowledge and KnowledgeEntry tables
      const [legacyEntries, entries] = await Promise.all([
        prisma.knowledge.findMany({
          where: {
            userId: context.userId,
            category: input.category || 'packaging',
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.knowledgeEntry.findMany({
          where: {
            userId: context.userId,
            OR: [
              { feature: { contains: input.featureName, mode: 'insensitive' as const } },
              { entryType: 'packaging' },
              { entryType: 'rule' },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const results: Array<{ source: string; content: string; structured?: unknown }> = [];

      for (const e of legacyEntries) {
        const featureLower = input.featureName.toLowerCase();
        const contentLower = (e.content || '').toLowerCase();
        if (contentLower.includes(featureLower)) {
          results.push({ source: 'knowledge', content: e.content, structured: e.structured });
        }
      }

      for (const e of entries) {
        results.push({
          source: e.entryType,
          content: `[${e.feature}] ${e.title}: ${e.content}`,
          structured: e.structured,
        });
      }

      if (results.length === 0) {
        return JSON.stringify({ results: [], message: 'No relevant knowledge base entries found.' });
      }

      return JSON.stringify({ results: results.slice(0, 5) });
    } catch (err) {
      console.error('[creative-agent] Knowledge search failed:', err);
      return JSON.stringify({ results: [], message: 'Knowledge base search failed.' });
    }
  },
};

// ─── Tool: check_competitor_messaging ──────────────────────────

interface CheckCompetitorInput {
  variants: Array<{ text: string; type: string }>;
  competitorContext?: string;
}

const checkCompetitorMessagingTool: AgentToolDef = {
  definition: {
    name: 'check_competitor_messaging',
    description:
      'Check if any slogan variant is too similar to competitor messaging or industry cliches. Returns conflict flags per variant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string' },
            },
          },
          description: 'Variants to check for competitor conflicts',
        },
        competitorContext: {
          type: 'string',
          description: 'Competitor context info (optional)',
        },
      },
      required: ['variants'],
    },
  },
  handler: async (rawInput: unknown, context: AgentContext): Promise<string> => {
    const input = rawInput as CheckCompetitorInput;
    context.onProgress({ step: 'check_competitor_messaging', detail: 'Checking for competitor conflicts', progress: 0.65 });

    const locale = context.locale || 'en';
    const lang = locale === 'zh' ? '中文' : 'English';
    const competitorCtx = input.competitorContext || (context.data.competitorContext as string) || '';
    const ctxBlock = competitorCtx
      ? `\nKnown competitor context:\n${competitorCtx}\n`
      : '';

    const prompt = `Check these slogan variants for potential conflicts with competitor messaging or industry cliches.

${ctxBlock}

Variants to check:
${input.variants.map((v, i) => `${i + 1}. [${v.type}] "${v.text}"`).join('\n')}

For each variant, assess:
1. Is it too similar to common competitor slogans in the mobile/electronics industry?
2. Is it an overused industry cliche?
3. Does it lack distinctiveness?

Respond in ${lang}. Output ONLY valid JSON:
{ "checks": [{ "text": "...", "hasConflict": false, "conflictNote": "reason if conflict found, empty string otherwise" }] }`;

    const provider = getAIProvider(context.provider as AIProvider, context.apiKey, context.model);
    const response = await provider.chat([
      { role: 'system', content: 'You are a competitive intelligence analyst for consumer electronics marketing.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = safeJsonParse(response.content) as { checks?: Array<{ text: string; hasConflict: boolean; conflictNote: string }> };
    const checks = parsed?.checks || [];
    return JSON.stringify({ checks });
  },
};

// ─── Agent Config Export ───────────────────────────────────────

export function getCreativeAgentConfig(locale: string, brandRules?: string[]): AgentRunnerConfig {
  const lang = locale === 'zh' ? '中文' : 'English';
  const brandBlock = brandRules?.length
    ? `\nBrand naming rules you MUST follow:\n${brandRules.map(r => `- ${r}`).join('\n')}`
    : '';

  return {
    systemPrompt: `You are a creative marketing exploration agent. Your job is to help find the best L2 slogan for a SP (Selling Point) feature.

Your workflow:
1. First, search the knowledge base for relevant past examples and brand rules (search_knowledge_base)
2. Generate 5 slogan variants with different creative approaches (generate_variants)
3. Evaluate all variants critically against quality standards (evaluate_variants)
4. Check for conflicts with competitor messaging (check_competitor_messaging)
5. Finally, synthesize all findings and recommend the best variant with clear reasoning

Be creative but disciplined. Quality over quantity.
Respond in ${lang}.${brandBlock}

After using all tools, provide your final recommendation in this JSON format:
{ "recommendation": { "bestIndex": 0, "reasoning": "why this variant is best" }, "variants": [{ "text": "...", "type": "factual|functional|emotional", "rationale": "...", "score": 8, "issues": [], "strengths": [], "hasConflict": false, "conflictNote": "" }] }`,
    tools: [
      generateVariantsTool,
      evaluateVariantsTool,
      searchKnowledgeBaseTool,
      checkCompetitorMessagingTool,
    ],
    maxIterations: 8,
    agentName: 'creative',
  };
}
