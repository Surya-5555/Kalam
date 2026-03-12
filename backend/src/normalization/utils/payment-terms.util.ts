/**
 * Payment-terms normalization utility.
 *
 * Converts a free-text payment-terms string into:
 *  – a normalized standard label (e.g. "Net 30")
 *  – the net-due period in whole days
 *  – early-payment discount details when present (e.g. "2/10 Net 30")
 *
 * All matching is deterministic (no AI involved).
 */

export interface NormalizedPaymentTerms {
  /** Original string as extracted by AI. */
  raw: string | null;
  /**
   * Standardised label.
   * e.g. "Net 30", "Due On Receipt", "COD", "Net 45 (2/10)", "EOM"
   */
  normalized: string | null;
  /**
   * Net-due period in whole calendar days.
   * 0 = due on receipt.  null when unparsable.
   */
  days: number | null;
  /** Whether a prompt-payment (early payment) discount offer was detected. */
  isEarlyPaymentDiscount: boolean;
  /** Days within which the discount applies. e.g. 10 for "2/10 Net 30". */
  earlyPaymentDays: number | null;
  /** Discount percentage offered. e.g. 2 for "2/10 Net 30". */
  earlyPaymentDiscountPct: number | null;
  /** 0–1 confidence in the parse. */
  confidence: number;
}

// ─── Named term aliases ───────────────────────────────────────────────────────
// Maps normalized lowercase key → { label, days }
const NAMED_TERMS: Array<{ patterns: RegExp[]; label: string; days: number }> = [
  {
    patterns: [/\b(due\s+on\s+receipt|payable\s+on\s+receipt|immediate(ly)?|upon\s+receipt|on\s+receipt|paid)\b/i],
    label: 'Due On Receipt',
    days: 0,
  },
  {
    patterns: [/\bcod\b|\bcash\s+on\s+delivery\b/i],
    label: 'COD',
    days: 0,
  },
  {
    patterns: [/\bcash\s+in\s+advance\b|\bcia\b|\bprepaid\b/i],
    label: 'Advance Payment',
    days: 0,
  },
  {
    patterns: [/\beom\b|\bend\s+of\s+month\b|\bend-of-month\b/i],
    label: 'EOM',
    days: 30,  // approximate; EOM technically means end of month from invoice
  },
  {
    patterns: [/\bnet\s+monthly\b/i],
    label: 'Net Monthly',
    days: 30,
  },
  {
    patterns: [/\bquarterly\b/i],
    label: 'Quarterly',
    days: 90,
  },
  {
    patterns: [/\binstallment(s)?\b|\bemi\b/i],
    label: 'Installments',
    days: null as unknown as number,  // indeterminate
  },
];

/** Extract "Net N" / "N days" style numeric terms, optionally with units. */
function extractNumericDays(s: string): number | null {
  // "Net 30", "Net 30 days", "30 Net", "30 day(s)", "due in 30 days"
  const patterns = [
    /\bnet\s*(\d+)\b/i,
    /\b(\d+)\s*(?:net|days?|day)\b/i,
    /\bdue\s+(?:in|within)\s*(\d+)\s*days?\b/i,
    /\bpayable\s+(?:within|in)\s*(\d+)\s*days?\b/i,
    /\b(\d+)\s*days?\s+(?:from|after|net)\b/i,
    /\bwithin\s*(\d+)\s*days?\b/i,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Detect early-payment discount notation "discount/earlyDays Net netDays".
 * Handles: "2/10 Net 30", "2% 10 Net 30", "2/10 n/30", "1.5/7 Net 45" etc.
 */
function extractEarlyPayment(s: string): {
  discountPct: number; earlyDays: number; netDays: number;
} | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*[%\/]\s*(\d+)\s+(?:net|n\/?)(\d+)/i);
  if (m) {
    return {
      discountPct: Number(m[1]),
      earlyDays: Number(m[2]),
      netDays: Number(m[3]),
    };
  }
  return null;
}

export function normalizePaymentTerms(raw: string | null | undefined): NormalizedPaymentTerms {
  if (raw == null || raw.trim() === '') {
    return {
      raw: raw ?? null,
      normalized: null,
      days: null,
      isEarlyPaymentDiscount: false,
      earlyPaymentDays: null,
      earlyPaymentDiscountPct: null,
      confidence: 0,
    };
  }

  const input = raw.trim();

  // ── 1. Early-payment discount ────────────────────────────────────────────
  const ep = extractEarlyPayment(input);
  if (ep) {
    return {
      raw: input,
      normalized: `Net ${ep.netDays} (${ep.discountPct}/${ep.earlyDays})`,
      days: ep.netDays,
      isEarlyPaymentDiscount: true,
      earlyPaymentDays: ep.earlyDays,
      earlyPaymentDiscountPct: ep.discountPct,
      confidence: 0.95,
    };
  }

  // ── 2. Named term aliases ────────────────────────────────────────────────
  for (const term of NAMED_TERMS) {
    if (term.patterns.some(p => p.test(input))) {
      return {
        raw: input,
        normalized: term.label,
        days: term.days,
        isEarlyPaymentDiscount: false,
        earlyPaymentDays: null,
        earlyPaymentDiscountPct: null,
        confidence: 0.95,
      };
    }
  }

  // ── 3. Numeric "Net N" / "N days" ────────────────────────────────────────
  const numDays = extractNumericDays(input);
  if (numDays !== null) {
    return {
      raw: input,
      normalized: `Net ${numDays}`,
      days: numDays,
      isEarlyPaymentDiscount: false,
      earlyPaymentDays: null,
      earlyPaymentDiscountPct: null,
      confidence: 0.9,
    };
  }

  // ── 4. Standalone number (e.g. "45") ────────────────────────────────────
  const bareNum = input.match(/^(\d+)$/);
  if (bareNum) {
    const d = Number(bareNum[1]);
    return {
      raw: input,
      normalized: `Net ${d}`,
      days: d,
      isEarlyPaymentDiscount: false,
      earlyPaymentDays: null,
      earlyPaymentDiscountPct: null,
      confidence: 0.7,
    };
  }

  // ── Fallback: preserve as-is, days unknown ──────────────────────────────
  return {
    raw: input,
    normalized: input,
    days: null,
    isEarlyPaymentDiscount: false,
    earlyPaymentDays: null,
    earlyPaymentDiscountPct: null,
    confidence: 0.3,
  };
}
