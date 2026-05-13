/**
 * Shared prompt + response normalizer for parse-params.
 * Used by both the server route and the client-direct path.
 */

export const PARSE_PARAMS_SYSTEM_PROMPT = `You are a product spec parser. Extract structured parameters from text or images.

## Output Format
Return valid JSON only, no markdown code blocks:
{
  "products": [
    {
      "name": "Product Name",
      "isOwnProduct": false,
      "params": {
        "display.type": "IPS LCD, 120Hz, 1050 nits (HBM)",
        "display.size": "6.72 inches, 108.8 cm2 (~86.0% screen-to-body ratio)",
        "display.resolution": "1080 x 2408 pixels, 20:9 ratio (~393 ppi density)",
        "platform.chipset": "Mediatek Dimensity 7300 (4 nm)",
        "platform.cpu": "Octa-core (4x2.5 GHz & 4x2.0 GHz)",
        "platform.gpu": "Mali-G615 MC2",
        "memory.internal": "8+256",
        "camera.specs": "50 MP, f/1.8, OIS + 2 MP, f/2.4",
        "camera.video": "4K@30fps, 1080p@60fps",
        "selfie.specs": "8 MP, f/2.0",
        "selfie.video": "1080p@30fps",
        "battery.type": "Li-Ion 7000 mAh",
        "battery.charging": "45W",
        "body.weight": "199g",
        "body.dimensions": "164.4 x 76.3 x 8.1 mm",
        "body.build": "Glass front, plastic frame",
        "body.protection": "IP64",
        "misc.colors": "Black, Blue",
        "misc.price": "14999"
      }
    }
  ]
}

## Rules
- Extract ALL products found in the text
- Use dot-notation keys as shown above
- Split compound values: "Li-Ion 7000 mAh, 45W" → battery.type: "Li-Ion 7000 mAh", battery.charging: "45W"
- Merge all rear camera specs into camera.specs, front camera into selfie.specs
- First product is isOwnProduct: true unless clearly marked otherwise
- Keep original values as-is. Do NOT expand abbreviations or translate.
- Memory variants go in memory.internal, prices in misc.price — never mix them.`;

export interface ParsedProduct {
  name: string;
  isOwnProduct: boolean;
  params: Record<string, string>;
}

/** Pull `{ products: [...] }` out of the model response, tolerating various shapes. */
export function normalizeParsedProducts(raw: string): ParsedProduct[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (Array.isArray(parsed)) return parsed as ParsedProduct[];
  if (Array.isArray(parsed.products)) return parsed.products as ParsedProduct[];
  if (parsed.params) {
    return [{ name: parsed.name || 'Product', isOwnProduct: true, params: parsed.params }];
  }
  throw new Error('Unrecognized response shape');
}
