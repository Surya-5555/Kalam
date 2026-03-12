import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type {
  DuplicateStatus,
  DuplicateMatch,
} from '../dto/duplicate-detection-result.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Key fields extracted from a NormalizedInvoice for comparison.
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchFields {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD date part only
  grandTotal: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  // Take only the YYYY-MM-DD portion of an ISO 8601 string.
  return d.substring(0, 10);
}

function totalsMatch(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 0.01;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the fields used for duplicate matching from a NormalizedInvoice. */
export function extractMatchFields(inv: NormalizedInvoice): MatchFields {
  return {
    supplierName: normalizeText(inv.supplier?.name),
    invoiceNumber: normalizeText(inv.invoice?.number),
    invoiceDate: normalizeDate(inv.invoice?.date?.normalized),
    grandTotal: inv.totals?.grandTotal ?? null,
  };
}

export interface MatchResult {
  status: Exclude<DuplicateStatus, 'no_duplicate'> | 'no_duplicate';
  matchedFields: string[];
}

/**
 * Compare a candidate invoice's fields against the current invoice's fields.
 *
 * Duplicate rules:
 *  - EXACT:    all four key fields match (supplier + number + date + total).
 *  - POSSIBLE: (invoice number + supplier match)
 *              OR (supplier + date + total match — financial fingerprint).
 *  - NO DUPLICATE: fewer than the above thresholds.
 *
 * A field is only considered matched when both candidate and current have a
 * non-null value for that field — we never count "both null" as a match.
 */
export function computeMatchResult(
  candidate: MatchFields,
  current: MatchFields,
): MatchResult {
  const matchedFields: string[] = [];

  const supplierMatch =
    candidate.supplierName !== null &&
    current.supplierName !== null &&
    candidate.supplierName === current.supplierName;

  const invoiceNumberMatch =
    candidate.invoiceNumber !== null &&
    current.invoiceNumber !== null &&
    candidate.invoiceNumber === current.invoiceNumber;

  const dateMatch =
    candidate.invoiceDate !== null &&
    current.invoiceDate !== null &&
    candidate.invoiceDate === current.invoiceDate;

  const totalMatch = totalsMatch(candidate.grandTotal, current.grandTotal);

  if (supplierMatch) matchedFields.push('supplierName');
  if (invoiceNumberMatch) matchedFields.push('invoiceNumber');
  if (dateMatch) matchedFields.push('invoiceDate');
  if (totalMatch) matchedFields.push('grandTotal');

  // Exact: all four non-null fields match.
  if (supplierMatch && invoiceNumberMatch && dateMatch && totalMatch) {
    return { status: 'exact_duplicate', matchedFields };
  }

  // Possible: strong identity (number + supplier) OR financial fingerprint
  // (supplier + date + total match but number differs / missing).
  if (
    (invoiceNumberMatch && supplierMatch) ||
    (supplierMatch && dateMatch && totalMatch)
  ) {
    return { status: 'possible_duplicate', matchedFields };
  }

  return { status: 'no_duplicate', matchedFields };
}

/**
 * Sort matches so exact duplicates appear first, then possible, ordered by
 * number of matched fields descending within each tier.
 */
export function sortMatches(
  matches: DuplicateMatch[],
): DuplicateMatch[] {
  return [...matches].sort((a, b) => {
    const tierScore = (m: DuplicateMatch) =>
      m.status === 'exact_duplicate' ? 2 : 1;
    const diff = tierScore(b) - tierScore(a);
    if (diff !== 0) return diff;
    return b.matchedFields.length - a.matchedFields.length;
  });
}
