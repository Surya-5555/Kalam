import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue, RuleConfig } from '../types';

const fmt = (n: number | null | undefined): string =>
  n == null ? 'null' : n.toLocaleString('en-IN', { maximumFractionDigits: 4 });

/**
 * LINE_ITEMS_RULE — validates each line item for numeric consistency.
 *
 * Error codes:
 *  LINE_NEGATIVE_UNIT_PRICE       – unitPrice < 0
 *  LINE_TAX_RATE_EXCEEDS_100      – taxRate > 100%
 *  LINE_DISCOUNT_PCT_EXCEEDS_100  – discount > 100% when discountType = 'percentage'
 *
 * Warning codes:
 *  LINE_TOTAL_MISMATCH            – stated total ≠ computed qty × rate ± tax
 *  LINE_ZERO_QUANTITY             – quantity is 0
 *  LINE_NEGATIVE_QUANTITY         – quantity < 0 (legitimate for credit notes)
 *  LINE_NEGATIVE_TOTAL            – line total < 0
 *  LINE_MISSING_DESCRIPTION       – description is null
 */
export function lineItemsRule(
  invoice: NormalizedInvoice,
  config: RuleConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tol = config.amountTolerance;

  for (const item of invoice.items) {
    const ctx = `items[${item.lineNumber}]`;

    // ── 1. Computed total vs stated total ───────────────────────────────────
    if (item.totalMismatch && item.total != null && item.computedTotal != null) {
      issues.push({
        code:     'LINE_TOTAL_MISMATCH',
        severity: 'warning',
        field:    `${ctx}.total`,
        message:  `Line ${item.lineNumber}: stated total (${fmt(item.total)}) ` +
                  `does not match qty × unit price (± discount/tax) = ${fmt(item.computedTotal)}`,
        expected: fmt(item.computedTotal),
        actual:   fmt(item.total),
      });
    }

    // ── 2. Negative unit price ──────────────────────────────────────────────
    if (item.unitPrice != null && item.unitPrice < -tol) {
      issues.push({
        code:     'LINE_NEGATIVE_UNIT_PRICE',
        severity: 'error',
        field:    `${ctx}.unitPrice`,
        message:  `Line ${item.lineNumber}: unit price is negative (${fmt(item.unitPrice)}). ` +
                  `Use a negative quantity for credit notes instead.`,
        actual:   fmt(item.unitPrice),
      });
    }

    // ── 3. Zero quantity ────────────────────────────────────────────────────
    if (item.quantity != null && item.quantity === 0) {
      issues.push({
        code:     'LINE_ZERO_QUANTITY',
        severity: 'warning',
        field:    `${ctx}.quantity`,
        message:  `Line ${item.lineNumber}: quantity is zero`,
      });
    }

    // ── 4. Negative quantity ────────────────────────────────────────────────
    if (item.quantity != null && item.quantity < -tol) {
      issues.push({
        code:     'LINE_NEGATIVE_QUANTITY',
        severity: 'warning',
        field:    `${ctx}.quantity`,
        message:  `Line ${item.lineNumber}: quantity is negative (${fmt(item.quantity)}). ` +
                  `Acceptable for credit notes; verify intent.`,
        actual:   fmt(item.quantity),
      });
    }

    // ── 5. Negative line total ──────────────────────────────────────────────
    if (item.total != null && item.total < -tol) {
      issues.push({
        code:     'LINE_NEGATIVE_TOTAL',
        severity: 'warning',
        field:    `${ctx}.total`,
        message:  `Line ${item.lineNumber}: line total is negative (${fmt(item.total)})`,
        actual:   fmt(item.total),
      });
    }

    // ── 6. Tax rate > 100% ──────────────────────────────────────────────────
    if (item.taxRate != null && item.taxRate > 100) {
      issues.push({
        code:     'LINE_TAX_RATE_EXCEEDS_100',
        severity: 'error',
        field:    `${ctx}.taxRate`,
        message:  `Line ${item.lineNumber}: tax rate (${fmt(item.taxRate)}%) exceeds 100%.`,
        actual:   fmt(item.taxRate),
      });
    }

    // ── 7. Percentage discount > 100% ──────────────────────────────────────
    if (
      item.discount != null &&
      item.discountType === 'percentage' &&
      item.discount > 100
    ) {
      issues.push({
        code:     'LINE_DISCOUNT_PCT_EXCEEDS_100',
        severity: 'error',
        field:    `${ctx}.discount`,
        message:  `Line ${item.lineNumber}: discount percentage (${fmt(item.discount)}%) exceeds 100%.`,
        actual:   fmt(item.discount),
      });
    }

    // ── 8. Missing description ──────────────────────────────────────────────
    if (!item.description) {
      issues.push({
        code:     'LINE_MISSING_DESCRIPTION',
        severity: 'warning',
        field:    `${ctx}.description`,
        message:  `Line ${item.lineNumber}: description is missing`,
      });
    }
  }

  return issues;
}
