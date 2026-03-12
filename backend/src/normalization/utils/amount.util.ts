/**
 * Numeric amount normalization utility.
 *
 * Converts raw currency/numeric strings into a structured result holding
 * the machine-readable numeric value, a locale-formatted display string,
 * and an optional inferred currency code.
 *
 * Handles:
 *  – Indian lakh/crore formatted numbers  (e.g. "1,23,456.78")
 *  – European decimal format              (e.g. "1.234,56" → 1234.56)
 *  – Currency symbols / codes             (₹, $, €, £, INR, USD …)
 *  – Numbers already stored as JS number  (pass-through)
 *  – Parenthetical negatives              (1,234.56) → -1234.56
 */

export interface NormalizedAmount {
  /** Original raw string (null when input was already a number). */
  raw: string | null;
  /** Machine-readable numeric value. null when unparsable. */
  machineReadableValue: number | null;
  /**
   * Human-friendly formatted string, e.g. "1,234.56".
   * null when machineReadableValue is null.
   */
  formatted: string | null;
  /**
   * ISO 4217 currency code inferred from the raw string, if any.
   * e.g. "INR", "USD", "EUR".  null when no currency symbol/code was found.
   */
  inferredCurrency: string | null;
  /** 0–1 confidence in the parse. */
  confidence: number;
}

// Currency symbols → ISO 4217 codes
const SYMBOL_MAP: Record<string, string> = {
  '₹': 'INR',
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '¢': 'USD',
  'A$': 'AUD',
  'C$': 'CAD',
  'S$': 'SGD',
  'HK$': 'HKD',
  'NZ$': 'NZD',
  'CHF': 'CHF',
};

// ISO 4217 codes that might appear as text prefixes/suffixes
const ISO_CODES = new Set([
  'INR','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','NZD','CHF',
  'CNY','KRW','MXN','BRL','ZAR','NOK','SEK','DKK','AED','SAR','QAR',
  'THB','MYR','IDR','PHP','PKR','BDT','LKR','NPR',
]);

function extractCurrency(raw: string): { code: string | null; stripped: string } {
  let s = raw.trim();

  // Multi-char symbols first (A$, C$, HK$, NZ$, S$)
  for (const sym of ['HK$', 'NZ$', 'A$', 'C$', 'S$']) {
    if (s.startsWith(sym) || s.endsWith(sym)) {
      return { code: SYMBOL_MAP[sym]!, stripped: s.replace(sym, '').trim() };
    }
  }

  // Single-char symbols
  for (const [sym, code] of Object.entries(SYMBOL_MAP)) {
    if (sym.length === 1 && (s.startsWith(sym) || s.endsWith(sym))) {
      return { code, stripped: s.replace(sym, '').trim() };
    }
  }

  // ISO 4217 text prefix/suffix (e.g. "INR 1,234.56" or "1,234.56 USD")
  const isoMatch = s.match(/^([A-Z]{3})\s+(.+)$/) ?? s.match(/^(.+)\s+([A-Z]{3})$/);
  if (isoMatch) {
    const maybeCode = (isoMatch[1].length === 3 ? isoMatch[1] : isoMatch[2]).toUpperCase();
    const rest = isoMatch[1].length === 3 ? isoMatch[2] : isoMatch[1];
    if (ISO_CODES.has(maybeCode)) {
      return { code: maybeCode, stripped: rest.trim() };
    }
  }

  return { code: null, stripped: s };
}

/**
 * Heuristic: determine whether a numeric string uses European decimal format
 * (period as thousands separator, comma as decimal) or standard format.
 *
 * Returns true for European format (e.g. "1.234,56").
 */
function isEuropeanFormat(s: string): boolean {
  // Has both period and comma: check which appears last
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever comes last is the decimal separator
    return lastComma > lastDot;
  }
  // Only commas (no dot): if the comma divides exactly 3 trailing digits it's thousands
  if (lastComma !== -1 && lastDot === -1) {
    const afterComma = s.slice(lastComma + 1);
    // "1,234" → thousands (afterComma.length === 3)
    // "1,23" / "1,2" → Indian sub-lakh grouping → treat as thousands too
    // "1,5" → could be decimal (European informal). Use length heuristic:
    return afterComma.length !== 2; // 2 decimal places → decimal; anything else → thousands
  }
  return false;
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Normalise a numeric amount from a raw string or a pre-parsed number.
 *
 * @param raw - String representation (e.g. "₹1,23,456.78") or a number.
 * @param overrideCurrency - ISO 4217 code to use instead of inferring from the raw string.
 */
export function normalizeAmount(
  raw: string | number | null | undefined,
  overrideCurrency?: string | null,
): NormalizedAmount {
  if (raw == null) {
    return { raw: null, machineReadableValue: null, formatted: null, inferredCurrency: overrideCurrency ?? null, confidence: 0 };
  }

  // Pass-through for pre-parsed numbers
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { raw: null, machineReadableValue: null, formatted: null, inferredCurrency: overrideCurrency ?? null, confidence: 0 };
    }
    return {
      raw: null,
      machineReadableValue: raw,
      formatted: formatAmount(raw),
      inferredCurrency: overrideCurrency ?? null,
      confidence: 1.0,
    };
  }

  const rawStr = String(raw).trim();
  if (rawStr === '') {
    return { raw: rawStr, machineReadableValue: null, formatted: null, inferredCurrency: overrideCurrency ?? null, confidence: 0 };
  }

  // ── Strip currency symbols / ISO codes ────────────────────────────────────
  let { code: inferredCurrency, stripped } = extractCurrency(rawStr);
  if (overrideCurrency) inferredCurrency = overrideCurrency;

  // ── Handle parenthetical negatives: (1,234.56) → -1234.56 ────────────────
  let isNegative = false;
  const parenMatch = stripped.match(/^\((.+)\)$/);
  if (parenMatch) {
    isNegative = true;
    stripped = parenMatch[1];
  }
  if (stripped.startsWith('-')) {
    isNegative = true;
    stripped = stripped.slice(1).trim();
  }

  // ── Strip any remaining whitespace ────────────────────────────────────────
  stripped = stripped.replace(/\s/g, '');

  // ── European vs standard format ───────────────────────────────────────────
  let normalised: string;
  if (isEuropeanFormat(stripped)) {
    // "1.234,56" → "1234.56"
    normalised = stripped.replace(/\./g, '').replace(',', '.');
  } else {
    // "1,23,456.78" or "1,234.56" → remove commas
    normalised = stripped.replace(/,/g, '');
  }

  const parsed = parseFloat(normalised);
  if (!Number.isFinite(parsed)) {
    return { raw: rawStr, machineReadableValue: null, formatted: null, inferredCurrency: inferredCurrency ?? null, confidence: 0 };
  }

  const value = isNegative ? -parsed : parsed;
  return {
    raw: rawStr,
    machineReadableValue: value,
    formatted: formatAmount(value),
    inferredCurrency: inferredCurrency ?? null,
    confidence: normalised !== stripped || isNegative ? 0.85 : 0.95,
  };
}
