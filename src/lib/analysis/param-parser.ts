import { DIRECTION_MAP, type SubValueRule } from './direction-map';

export interface ExtractedSubValue {
  label: string;
  value: number;
  direction: 'higher' | 'lower';
  raw: string;  // e.g. "144Hz"
  ordinal?: boolean;  // any difference is significant (model numbers)
}

/**
 * Extract all comparable numeric sub-values from a parameter string.
 * E.g. "6.72 FHD LCD 144Hz 1000nits" →
 *   [{ label: 'refresh', value: 144, direction: 'higher', raw: '144Hz' }, ...]
 */
export function extractSubValues(paramKey: string, rawValue: string): ExtractedSubValue[] {
  const rules = DIRECTION_MAP[paramKey];
  if (!rules || rules.length === 0) return [];

  const results: ExtractedSubValue[] = [];
  for (const rule of rules) {
    const match = rawValue.match(rule.pattern);
    if (match && match[1]) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num)) {
        results.push({
          label: rule.label,
          value: num,
          direction: rule.direction,
          raw: match[0],
          ordinal: rule.ordinal,
        });
      }
    }
  }
  return results;
}

export type LeadLevel = 'strong_lead' | 'slight_lead' | 'neutral' | 'slight_lag' | 'strong_lag';

/**
 * Compare own value vs best competitor value for a single sub-value.
 * Returns lead level and percentage difference.
 */
export function compareValues(
  own: number,
  competitors: number[],
  direction: 'higher' | 'lower'
): { leadLevel: LeadLevel; diffPercent: number } {
  if (competitors.length === 0) return { leadLevel: 'neutral', diffPercent: 0 };

  // Find the best competitor value
  const bestComp = direction === 'higher'
    ? Math.max(...competitors)
    : Math.min(...competitors);

  if (bestComp === 0 && own === 0) return { leadLevel: 'neutral', diffPercent: 0 };

  const base = Math.max(Math.abs(bestComp), Math.abs(own), 1);
  const diff = direction === 'higher' ? own - bestComp : bestComp - own;
  const diffPercent = (diff / base) * 100;

  if (diffPercent > 20) return { leadLevel: 'strong_lead', diffPercent };
  if (diffPercent > 5) return { leadLevel: 'slight_lead', diffPercent };
  if (diffPercent > -5) return { leadLevel: 'neutral', diffPercent };
  if (diffPercent > -20) return { leadLevel: 'slight_lag', diffPercent };
  return { leadLevel: 'strong_lag', diffPercent };
}

/**
 * For params without numeric rules (speakers, fingerprint, etc.),
 * do a simple string equality check.
 */
export function compareQualitative(own: string, competitors: string[]): LeadLevel {
  if (!own || own.trim() === '') return 'neutral';
  const ownLower = own.toLowerCase().trim();

  // Speakers: dual > single
  if (/dual|双/i.test(ownLower)) {
    const anyCompSingle = competitors.some((c) => !/dual|双/i.test(c));
    if (anyCompSingle) return 'slight_lead';
  }

  // Generic: if all competitors have same value, it's neutral
  const allSame = competitors.every((c) => c.toLowerCase().trim() === ownLower);
  if (allSame) return 'neutral';

  return 'neutral'; // Can't determine without more context
}
