/**
 * Migrates old flat param keys to new dot-notation keys.
 * Old: { display: "6.72 FHD LCD 144Hz 1000nits", chipset: "MTK D7400..." }
 * New: { "display.size": "6.72", "platform.chipset": "...", ... }
 *
 * If params already use dot-notation, returns as-is.
 */
export function migrateOldParams(params: Record<string, string>): Record<string, string> {
  const keys = Object.keys(params);

  // Already new format if any key contains a dot
  if (keys.some(k => k.includes('.'))) return params;

  // No old keys found
  if (keys.length === 0) return params;

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!value || !value.trim()) continue;
    const v = value.trim();

    switch (key) {
      case 'display':
        splitDisplay(v, result);
        break;
      case 'chipset':
        result['platform.chipset'] = v;
        break;
      case 'battery':
        splitBattery(v, result);
        break;
      case 'camera':
      case 'rear_camera':
        result['camera.specs'] = v;
        break;
      case 'front_camera':
        result['selfie.specs'] = v;
        break;
      case 'memory':
        result['memory.internal'] = v;
        break;
      case 'durability':
        result['body.protection'] = v;
        break;
      case 'price':
        result['misc.price'] = v;
        break;
      case 'launch':
        // Keep as metadata — not in default rows but don't lose it
        result['launch'] = v;
        break;
      case 'others':
        splitOthers(v, result);
        break;
      default:
        // Unknown keys: preserve as-is
        result[key] = v;
        break;
    }
  }

  return result;
}

function splitDisplay(v: string, out: Record<string, string>) {
  // Try to extract sub-values from compound display string
  // e.g., "6.72 FHD LCD 144Hz 1000nits" or "6.72英寸 FHD LCD / 144Hz / 1000nits"

  const sizeMatch = v.match(/(\d+\.?\d*)\s*(?:英寸|inch|inches|"|'')?/i);
  const typeMatch = v.match(/\b(AMOLED|OLED|LCD|IPS|LTPO|TFT)\b/i);
  const refreshMatch = v.match(/(\d+)\s*Hz/i);
  const brightnessMatch = v.match(/(\d+)\s*nits/i);

  // If we can extract at least 2 sub-values, split them
  const extracted = [sizeMatch, typeMatch, refreshMatch, brightnessMatch].filter(Boolean);

  if (extracted.length >= 2) {
    if (sizeMatch) {
      // Build screen size: include size + resolution + panel type
      const parts: string[] = [];
      parts.push(sizeMatch[1] + (v.includes('英寸') ? '英寸' : ' inches'));
      const resMatch = v.match(/\b(FHD|2K|QHD|4K|HD\+?|1080p|1440p)\b/i);
      if (resMatch) parts.push(resMatch[0]);
      if (typeMatch) parts.push(typeMatch[0]);
      out['display.size'] = parts.join(' ');
    }
    // refreshRate and brightness are now part of display.type — include them there
    if (typeMatch) {
      const typeParts: string[] = [typeMatch[0]];
      if (refreshMatch) typeParts.push(refreshMatch[1] + 'Hz');
      if (brightnessMatch) typeParts.push(brightnessMatch[1] + 'nits');
      out['display.type'] = typeParts.join(', ');
    }
  } else {
    // Can't split reliably — put entire value in display.size
    out['display.size'] = v;
  }
}

function splitBattery(v: string, out: Record<string, string>) {
  // e.g., "7000mAh + 45W" or "7000mAh+45W" or "7300mAh, 90W"
  const capMatch = v.match(/(\d+)\s*mAh/i);
  const chgMatch = v.match(/(\d+)\s*[wW]/);

  if (capMatch && chgMatch) {
    out['battery.type'] = capMatch[1] + 'mAh';
    out['battery.charging'] = chgMatch[1] + 'W';
  } else if (capMatch) {
    out['battery.type'] = capMatch[1] + 'mAh';
  } else {
    out['battery.type'] = v;
  }
}

function splitOthers(v: string, out: Record<string, string>) {
  // Try to route sub-parts by keywords
  const parts = v.split(/[\/,;]/).map(s => s.trim()).filter(Boolean);
  const unmatched: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.includes('散热') || lower.includes('cooling') || lower.includes('vc')) {
      // Cooling → body category (or just keep in a catch-all)
      out['body.dimensions'] = out['body.dimensions']
        ? out['body.dimensions'] + ' / ' + part : part;
    } else if (lower.includes('扬声器') || lower.includes('speaker') || lower.includes('loudspeaker')) {
      unmatched.push(part);
    } else if (lower.includes('nfc')) {
      out['misc.nfc'] = lower.includes('不') || lower.includes('no') ? '不支持' : '支持';
    } else if (lower.includes('指纹') || lower.includes('fingerprint')) {
      unmatched.push(part);
    } else {
      unmatched.push(part);
    }
  }

  // Any unmatched parts → keep as generic (won't display in default rows but won't be lost)
  if (unmatched.length > 0) {
    out['others'] = unmatched.join(' / ');
  }
}
