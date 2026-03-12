import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue, RuleConfig } from '../types';

const fmt = (n: number | null | undefined): string =>
  n == null ? 'null' : n.toLocaleString('en-IN', { maximumFractionDigits: 4 });

const near = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol;

/**
 * TOTALS_RULE — validates the internal consistency of all monetary totals.
 *
 * Error codes:
 *  TOTALS_GRAND_MISMATCH            – subtotal − discount + tax + shipping ≠ grandTotal
 *  TOTALS_AMOUNT_DUE_EXCEEDS_GRAND  – amountDue > grandTotal
 *  TOTALS_AMOUNT_DUE_PAYMENT_MISMATCH – grandTotal − amountPaid ≠ amountDue
 *  TOTALS_NEGATIVE_GRAND_TOTAL      – grandTotal < 0
 *  TOTALS_NEGATIVE_SUBTOTAL         – subtotal < 0
 *
 * Warning codes:
 *  TOTALS_ITEMS_SUM_SUBTOTAL_MISMATCH – Σ item.total differs from subtotal by > 5%
 *  TOTALS_MISSING_GRAND_TOTAL         – grandTotal could not be extracted
 */
export function totalsRule(
  invoice: NormalizedInvoice,
  config: RuleConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t   = invoice.totals;
  const tol = config.amountTolerance;

  // ── 1. grand total breakdown cross-check ─────────────────────────────────
  if (t.grandTotalMismatch) {
    const sub      = t.subtotal             ?? 0;
    const disc     = t.totalDiscount        ?? 0;
    const tax      = t.totalTax             ?? 0;
    const shipping = t.shippingAndHandling  ?? 0;
    const expected = Math.round((sub - disc + tax + shipping) * 100) / 100;

    issues.push({
      code:     'TOTALS_GRAND_MISMATCH',
      severity: 'error',
      field:    'totals.grandTotal',
      message:  `Grand total does not equal subtotal − discount + tax + shipping. ` +
                `Expected ${fmt(expected)}, found ${fmt(t.grandTotal)}.`,
      expected: fmt(expected),
      actual:   fmt(t.grandTotal),
    });
  }

  // ── 2. amountDue must not exceed grandTotal ───────────────────────────────
  if (t.amountDue != null && t.grandTotal != null && t.amountDue > t.grandTotal + tol) {
    issues.push({
      code:     'TOTALS_AMOUNT_DUE_EXCEEDS_GRAND',
      severity: 'error',
      field:    'totals.amountDue',
      message:  `Amount due (${fmt(t.amountDue)}) exceeds grand total (${fmt(t.grandTotal)})`,
      expected: `<= ${fmt(t.grandTotal)}`,
      actual:   fmt(t.amountDue),
    });
  }

  // ── 3. grandTotal − amountPaid ≈ amountDue ───────────────────────────────
  if (t.grandTotal != null && t.amountPaid != null && t.amountDue != null) {
    const expectedDue = Math.round((t.grandTotal - t.amountPaid) * 100) / 100;
    if (!near(t.amountDue, expectedDue, tol)) {
      issues.push({
        code:     'TOTALS_AMOUNT_DUE_PAYMENT_MISMATCH',
        severity: 'warning',
        field:    'totals.amountDue',
        message:  `Amount due (${fmt(t.amountDue)}) should equal grand total − amount paid (${fmt(expectedDue)})`,
        expected: fmt(expectedDue),
        actual:   fmt(t.amountDue),
      });
    }
  }

  // ── 4. sum of line item totals vs subtotal ────────────────────────────────
  if (t.itemsSumTotal != null && t.subtotal != null && t.subtotal !== 0) {
    const diff    = Math.abs(t.itemsSumTotal - t.subtotal);
    const relDiff = diff / Math.abs(t.subtotal);
    // Only flag when both the absolute diff is > 10× tolerance AND > 5% relative.
    // Header-level discounts can legitimately cause a difference.
    if (diff > tol * 10 && relDiff > 0.05) {
      issues.push({
        code:     'TOTALS_ITEMS_SUM_SUBTOTAL_MISMATCH',
        severity: 'warning',
        field:    'totals.subtotal',
        message:  `Sum of line item totals (${fmt(t.itemsSumTotal)}) differs from subtotal (${fmt(t.subtotal)}) ` +
                  `by ${(relDiff * 100).toFixed(1)}%. Check for header-level discounts or extraction errors.`,
        expected: fmt(t.subtotal),
        actual:   fmt(t.itemsSumTotal),
      });
    }
  }

  // ── 5. negative grand total ───────────────────────────────────────────────
  if (t.grandTotal != null && t.grandTotal < -tol) {
    issues.push({
      code:     'TOTALS_NEGATIVE_GRAND_TOTAL',
      severity: 'error',
      field:    'totals.grandTotal',
      message:  `Grand total is negative (${fmt(t.grandTotal)}). Should be ≥ 0 for a standard invoice.`,
      actual:   fmt(t.grandTotal),
    });
  }

  // ── 6. negative subtotal ─────────────────────────────────────────────────
  if (t.subtotal != null && t.subtotal < -tol) {
    issues.push({
      code:     'TOTALS_NEGATIVE_SUBTOTAL',
      severity: 'error',
      field:    'totals.subtotal',
      message:  `Subtotal is negative (${fmt(t.subtotal)})`,
      actual:   fmt(t.subtotal),
    });
  }

  // ── 7. grand total missing ────────────────────────────────────────────────
  if (t.grandTotal == null) {
    issues.push({
      code:     'TOTALS_MISSING_GRAND_TOTAL',
      severity: 'warning',
      field:    'totals.grandTotal',
      message:  'Grand total could not be extracted from the invoice',
    });
  }

  return issues;
}
