/**
 * Packaging strategies — per product positioning.
 *
 * The strategy determines, given a SP's (tier, leadLevel), which slogan type
 * is the "main" choice and whether the slogan can use 极限词 ("最强"/"首个"/etc).
 * This used to be hard-coded in SLOGAN_GENERATION_RULES Step 1 — moving it here
 * makes the decision deterministic and easy to extend when the team produces
 * other product lines (高端 / 极客 / 影像 etc).
 *
 * Decisions are injected into the user prompt's <待包装> block as hints per row,
 * so the model just follows orders instead of inferring from rule tables.
 */

export type SloganType = 'factual' | 'functional' | 'emotional';

export interface SloganDecision {
  /** Which slogan type should be the main (l2Slogan) for this SP */
  sloganType: SloganType;
  /** Whether 极限词 ("最强" / "首个" / "唯一" / "第一档") is permitted */
  allowExtreme: boolean;
}

export type LeadLevel = 'paramLead' | 'paramParity' | 'noAdvantage';

export interface PackagingStrategy {
  key: string;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  /** Decision rule per scenario */
  rules: Record<LeadLevel, SloganDecision>;
}

export const PACKAGING_STRATEGIES: Record<string, PackagingStrategy> = {
  'value-for-money': {
    key: 'value-for-money',
    label: { zh: '性价比 / 中低端', en: 'Value-for-Money' },
    description: {
      zh: '参数堆叠 + 极限词，主推写实型 Slogan',
      en: 'Spec-heavy with extreme words; lead with factual slogans',
    },
    rules: {
      paramLead:   { sloganType: 'factual',    allowExtreme: true },
      paramParity: { sloganType: 'functional', allowExtreme: false },
      noAdvantage: { sloganType: 'emotional',  allowExtreme: false },
    },
  },
  'premium': {
    key: 'premium',
    label: { zh: '高端 / 旗舰', en: 'Premium / Flagship' },
    description: {
      zh: '情感叙事为主，弱化参数堆叠',
      en: 'Emotion-led; downplay raw specs',
    },
    rules: {
      paramLead:   { sloganType: 'emotional',  allowExtreme: false },
      paramParity: { sloganType: 'emotional',  allowExtreme: false },
      noAdvantage: { sloganType: 'emotional',  allowExtreme: false },
    },
  },
  'tech-flagship': {
    key: 'tech-flagship',
    label: { zh: '极客 / 技术派', en: 'Tech / Geek' },
    description: {
      zh: '突出技术参数和体验细节',
      en: 'Spec-forward with technical depth',
    },
    rules: {
      paramLead:   { sloganType: 'factual',    allowExtreme: true },
      paramParity: { sloganType: 'factual',    allowExtreme: false },
      noAdvantage: { sloganType: 'functional', allowExtreme: false },
    },
  },
};

export const DEFAULT_STRATEGY_KEY = 'value-for-money';

export function getStrategy(key?: string | null): PackagingStrategy {
  return PACKAGING_STRATEGIES[key || DEFAULT_STRATEGY_KEY]
      || PACKAGING_STRATEGIES[DEFAULT_STRATEGY_KEY];
}

/** Map a tier to a lead level. tier 1 = lead, tier 2 = parity, tier 3 = no advantage. */
export function decideLeadLevel(tier: number): LeadLevel {
  if (tier === 1) return 'paramLead';
  if (tier === 2) return 'paramParity';
  return 'noAdvantage';
}

/** Main entry: given strategy key and SP tier, return the slogan decision. */
export function decideSloganTypeForKsp(strategyKey: string | null | undefined, tier: number): SloganDecision {
  const strategy = getStrategy(strategyKey);
  return strategy.rules[decideLeadLevel(tier)];
}

/** Format the per-row hint that goes into the <待包装> block. */
export function formatSloganHint(decision: SloganDecision): string {
  const typeLabel = { factual: '写实', functional: '功能', emotional: '情绪' }[decision.sloganType];
  const extremeNote = decision.allowExtreme ? '，可用极限词' : '';
  return `[主 Slogan 用${typeLabel}型${extremeNote}]`;
}
