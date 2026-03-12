/**
 * GSTIN normalization and validation utility.
 *
 * GSTIN format (15 characters):
 *   Pos 1–2  : 2-digit GST state code  (01–37)
 *   Pos 3–12 : 10-char PAN number      ([A-Z]{5}[0-9]{4}[A-Z])
 *   Pos 13   : Entity number           (1–9 or A–Z)
 *   Pos 14   : Default 'Z'
 *   Pos 15   : Check digit             (alphanumeric, computed via a mod-36 algo)
 *
 * This utility:
 *  1. Removes common noise (spaces, dashes, dots, newlines, zero-width chars).
 *  2. Upper-cases the result.
 *  3. Validates the structural regex.
 *  4. Validates the official GSTIN check digit (MOD-36 algorithm).
 *  5. Extracts the embedded state code and PAN segment.
 */

export interface NormalizedGstin {
  /** Original string as extracted. */
  raw: string | null;
  /** Cleaned 15-char uppercase GSTIN. null when format is invalid. */
  normalized: string | null;
  /** Whether the normalized string matches the GSTIN format regex. */
  isFormatValid: boolean;
  /** Whether the check digit is mathematically correct. */
  isChecksumValid: boolean;
  /** 2-digit GST state code embedded in positions 1–2. */
  stateCode: string | null;
  /** 10-char PAN segment embedded in positions 3–12. */
  panSegment: string | null;
  /** Entity number embedded in position 13. */
  entityCode: string | null;
  /** 0–1 confidence in the result. */
  confidence: number;
}

/** Valid GST state codes (01–37, but 25 is unassigned). */
const VALID_GST_CODES = new Set([
  '01','02','03','04','05','06','07','08','09','10',
  '11','12','13','14','15','16','17','18','19','20',
  '21','22','23','24','26','27','28','29','30','31',
  '32','33','34','35','36','37',
  // Special registrations
  '97','99',
]);

/** Official GSTIN format regex (structural check only — not check-digit). */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * MOD-36 GSTIN check-digit validation.
 * Reference: GSTN technical document.
 */
function validateCheckDigit(gstin: string): boolean {
  const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const MODULUS = 36;
  const FACTOR = 2;
  let sum = 0;
  let fac = FACTOR;

  for (let i = gstin.length - 2; i >= 0; i--) {
    const codePoint = CHARSET.indexOf(gstin[i]);
    if (codePoint === -1) return false;
    let addend = fac * codePoint;
    fac = fac === 2 ? 1 : 2;
    addend = Math.floor(addend / MODULUS) + (addend % MODULUS);
    sum += addend;
  }

  const remainder = sum % MODULUS;
  const checkIndex = (MODULUS - remainder) % MODULUS;
  return CHARSET[checkIndex] === gstin[gstin.length - 1];
}

export function normalizeGstin(raw: string | null | undefined): NormalizedGstin {
  const empty: NormalizedGstin = {
    raw: raw ?? null,
    normalized: null,
    isFormatValid: false,
    isChecksumValid: false,
    stateCode: null,
    panSegment: null,
    entityCode: null,
    confidence: 0,
  };

  if (raw == null || raw.trim() === '') return empty;

  const input = raw.trim();

  // ── 1. Strip noise characters ────────────────────────────────────────────
  // Remove spaces, dashes, dots, slashes, zero-width chars, control chars
  const cleaned = input
    .replace(/[\s\-\.\/\\]/g, '')   // common separators
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // zero-width / NBSP
    .toUpperCase();

  // ── 2. Structural format check ───────────────────────────────────────────
  const isFormatValid = GSTIN_REGEX.test(cleaned);

  if (!isFormatValid) {
    // Return the cleaned (but invalid) form so callers can see what was there
    return {
      raw: input,
      normalized: cleaned.length === 15 ? cleaned : null,
      isFormatValid: false,
      isChecksumValid: false,
      stateCode: cleaned.length >= 2 ? cleaned.slice(0, 2) : null,
      panSegment: cleaned.length >= 12 ? cleaned.slice(2, 12) : null,
      entityCode: cleaned.length >= 13 ? cleaned[12] : null,
      confidence: cleaned.length === 15 ? 0.4 : 0.1,
    };
  }

  // ── 3. Check-digit validation ────────────────────────────────────────────
  const isChecksumValid = validateCheckDigit(cleaned);

  // ── 4. Extract segments ──────────────────────────────────────────────────
  const stateCode  = cleaned.slice(0, 2);
  const panSegment = cleaned.slice(2, 12);
  const entityCode = cleaned[12];

  const isKnownState = VALID_GST_CODES.has(stateCode);

  const confidence =
    isChecksumValid && isKnownState ? 1.0 :
    isChecksumValid && !isKnownState ? 0.8 :
    !isChecksumValid && isKnownState ? 0.6 : 0.4;

  return {
    raw: input,
    normalized: cleaned,
    isFormatValid: true,
    isChecksumValid,
    stateCode,
    panSegment,
    entityCode,
    confidence,
  };
}
