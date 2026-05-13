/**
 * Cheap edit-fraction estimator.
 *
 * Returns a number in [0, 1] roughly proportional to how much the user changed
 * the original AI-generated string. 0 = identical, 1 = completely different.
 *
 * We use a banded Levenshtein distance capped at 200 characters per side, so
 * cost stays bounded for long L3 JSON blobs.
 */

const MAX_LEN = 200;

export function editFraction(original: string, current: string): number {
  const a = (original || '').slice(0, MAX_LEN);
  const b = (current || '').slice(0, MAX_LEN);
  if (a === b) return 0;
  if (!a.length) return b.length ? 1 : 0;
  if (!b.length) return 1;

  // Standard Levenshtein with one rolling row
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  const distance = prev[b.length];
  const denom = Math.max(a.length, b.length);
  return Math.round((distance / denom) * 100) / 100;
}
