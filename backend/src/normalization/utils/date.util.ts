/**
 * Date normalization utility.
 *
 * Accepts a date string in a wide range of formats and normalises it to
 * ISO 8601 YYYY-MM-DD.  Returns a structured result so callers can
 * preserve the raw input alongside the machine-readable value.
 */

export interface NormalizedDate {
  /** Original string as provided (from canonical / AI output). */
  raw: string | null;
  /** ISO 8601 normalised date: YYYY-MM-DD.  null when unparsable. */
  normalized: string | null;
  /**
   * Unix epoch milliseconds (UTC midnight) of the normalised date.
   * null when normalized is null.
   */
  machineReadableValue: number | null;
  /**
   * Days from today (positive = future, negative = past).
   * null when normalized is null.
   */
  daysFromToday: number | null;
  /** 0–1 confidence in the parse.  1.0 = unambiguous, 0.5 = heuristic. */
  confidence: number;
}

// Reference date is computed once per import to keep normalisation deterministic.
const TODAY_MS = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
})();

/** Pad a number to 2 digits. */
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Build an ISO-8601 date string.  Validates that y/m/d are in legal range
 * before committing; returns null for out-of-range values.
 */
function buildIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const epoch = Date.UTC(y, m - 1, d);
  const check = new Date(epoch);
  // JS silently overflows day-of-month; verify it didn't shift the month.
  if (check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function epochFromIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysFromTodayFn(epoch: number): number {
  return Math.round((epoch - TODAY_MS) / 86_400_000);
}

/** Month name → 1-based month number. */
const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Attempt to parse a raw date string.
 *
 * Supported patterns:
 *  YYYY-MM-DD          (already in target format)
 *  DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *  MM/DD/YYYY, MM-DD-YYYY  (only when part1 ≤ 12 and part2 > 12, or vice versa)
 *  YYYY/MM/DD
 *  D MMM YYYY, DD MMM YYYY        e.g. "12 Mar 2026"
 *  D MMMM YYYY, DD MMMM YYYY      e.g. "12 March 2026"
 *  MMMM D, YYYY                   e.g. "March 12, 2026"
 *  MMM D, YYYY                    e.g. "Mar 12, 2026"
 *  D-MMM-YYYY                     e.g. "12-Mar-2026"
 *  Ordinals like "12th March 2026" are handled by stripping the suffix.
 */
export function normalizeDate(raw: string | null | undefined): NormalizedDate {
  if (raw == null || raw.trim() === '') {
    return { raw: raw ?? null, normalized: null, machineReadableValue: null, daysFromToday: null, confidence: 0 };
  }

  const input = raw.trim();

  // ── 1. Already YYYY-MM-DD ─────────────────────────────────────────────────
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const iso = buildIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (iso) {
      const epoch = epochFromIso(iso);
      return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 1.0 };
    }
  }

  // ── 2. YYYY/MM/DD or YYYY.MM.DD ──────────────────────────────────────────
  const ymdSlash = input.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (ymdSlash) {
    const iso = buildIso(Number(ymdSlash[1]), Number(ymdSlash[2]), Number(ymdSlash[3]));
    if (iso) {
      const epoch = epochFromIso(iso);
      return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.95 };
    }
  }

  // ── 3. Numeric separators: D/M/Y or M/D/Y ────────────────────────────────
  const numParts = input.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (numParts) {
    let p1 = Number(numParts[1]);
    let p2 = Number(numParts[2]);
    let yr = Number(numParts[3]);
    if (yr < 100) yr += yr >= 50 ? 1900 : 2000;

    // Disambiguation: if p1 > 12, it must be day; if p2 > 12, it must be day.
    if (p1 > 12 && p2 <= 12) {
      // DD/MM/YYYY
      const iso = buildIso(yr, p2, p1);
      if (iso) {
        const epoch = epochFromIso(iso);
        return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.9 };
      }
    } else if (p2 > 12 && p1 <= 12) {
      // MM/DD/YYYY
      const iso = buildIso(yr, p1, p2);
      if (iso) {
        const epoch = epochFromIso(iso);
        return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.9 };
      }
    } else {
      // Ambiguous: assume DD/MM/YYYY (more common on Indian invoices)
      const iso = buildIso(yr, p2, p1);
      if (iso) {
        const epoch = epochFromIso(iso);
        return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.7 };
      }
    }
  }

  // ── 4. Text month formats ─────────────────────────────────────────────────
  // Strip ordinal suffixes (1st, 2nd, 3rd, 4th … 31st)
  const stripped = input.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

  // "12 March 2026" / "12 Mar 2026" / "12-Mar-2026"
  const dmy = stripped.match(/^(\d{1,2})[\s\-]+([a-z]+)[\s\-,]+(\d{4})$/i);
  if (dmy) {
    const mn = MONTH_MAP[dmy[2].toLowerCase()];
    if (mn) {
      const iso = buildIso(Number(dmy[3]), mn, Number(dmy[1]));
      if (iso) {
        const epoch = epochFromIso(iso);
        return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.95 };
      }
    }
  }

  // "March 12, 2026" / "Mar 12, 2026"
  const mdy = stripped.match(/^([a-z]+)[\s\-]+(\d{1,2})[\s,]+(\d{4})$/i);
  if (mdy) {
    const mn = MONTH_MAP[mdy[1].toLowerCase()];
    if (mn) {
      const iso = buildIso(Number(mdy[3]), mn, Number(mdy[2]));
      if (iso) {
        const epoch = epochFromIso(iso);
        return { raw: input, normalized: iso, machineReadableValue: epoch, daysFromToday: daysFromTodayFn(epoch), confidence: 0.95 };
      }
    }
  }

  // Gave up.
  return { raw: input, normalized: null, machineReadableValue: null, daysFromToday: null, confidence: 0 };
}
