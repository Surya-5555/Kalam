import type { NormalizedInvoice, GstComponent } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue, RuleConfig } from '../types';

const fmt = (n: number | null | undefined): string =>
  n == null ? 'null' : n.toLocaleString('en-IN', { maximumFractionDigits: 4 });

const near = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol;

/**
 * TAX_RULE — validates tax section consistency and Indian GST-specific rules.
 *
 * Error codes:
 *  TAX_BREAKDOWN_SUM_MISMATCH   – Σ breakdown.taxAmount ≠ tax.totalTaxAmount
 *  TAX_CGST_SGST_RATE_MISMATCH  – CGST rate ≠ SGST/UTGST rate (intra-state law)
 *  TAX_IGST_WITH_CGST_SGST      – IGST coexists with CGST/SGST/UTGST
 *
 * Warning codes:
 *  TAX_TOTAL_SECTION_MISMATCH   – tax.totalTaxAmount ≠ totals.totalTax
 *  TAX_ENTRY_AMOUNT_MISMATCH    – taxableAmount × rate / 100 ≠ taxAmount
 *  TAX_ENTRY_HIGH_RATE          – rate > 50% (unusually high, flag for review)
 *  TAX_NEGATIVE_AMOUNT          – any tax entry has negative taxAmount
 */
export function taxRule(
  invoice: NormalizedInvoice,
  config: RuleConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tol = config.amountTolerance;
  const { breakdown, totalTaxAmount, regime } = invoice.tax;

  // ── 1. Sum of breakdown taxAmounts ≈ totalTaxAmount ──────────────────────
  const allHaveAmount = breakdown.length > 0 && breakdown.every(e => e.taxAmount != null);
  if (allHaveAmount && totalTaxAmount != null) {
    const sum     = breakdown.reduce((acc, e) => acc + (e.taxAmount ?? 0), 0);
    const rounded = Math.round(sum * 100) / 100;
    if (!near(rounded, totalTaxAmount, tol)) {
      issues.push({
        code:     'TAX_BREAKDOWN_SUM_MISMATCH',
        severity: 'error',
        field:    'tax.totalTaxAmount',
        message:  `Sum of tax breakdown entries (${fmt(rounded)}) does not equal ` +
                  `declared total tax amount (${fmt(totalTaxAmount)})`,
        expected: fmt(rounded),
        actual:   fmt(totalTaxAmount),
      });
    }
  }

  // ── 2. tax.totalTaxAmount ≈ totals.totalTax (cross-section) ──────────────
  if (totalTaxAmount != null && invoice.totals.totalTax != null) {
    if (!near(totalTaxAmount, invoice.totals.totalTax, tol)) {
      issues.push({
        code:     'TAX_TOTAL_SECTION_MISMATCH',
        severity: 'warning',
        field:    'totals.totalTax',
        message:  `Tax section total (${fmt(totalTaxAmount)}) differs from totals section ` +
                  `totalTax (${fmt(invoice.totals.totalTax)})`,
        expected: fmt(totalTaxAmount),
        actual:   fmt(invoice.totals.totalTax),
      });
    }
  }

  // ── 3. CGST rate must equal SGST/UTGST rate (intra-state GST) ────────────
  if (config.enforceCgstEqualsSgst && regime === 'GST') {
    const cgst = breakdown.find(e => e.gstComponent === 'CGST');
    const sgst = breakdown.find(
      e => e.gstComponent === 'SGST' || e.gstComponent === 'UTGST',
    );

    if (cgst && sgst && cgst.rate != null && sgst.rate != null) {
      if (!near(cgst.rate, sgst.rate, 0.001)) {
        issues.push({
          code:     'TAX_CGST_SGST_RATE_MISMATCH',
          severity: 'error',
          field:    'tax.breakdown',
          message:  `CGST rate (${fmt(cgst.rate)}%) must equal ${sgst.gstComponent} rate ` +
                    `(${fmt(sgst.rate)}%) for intra-state supply`,
          expected: fmt(cgst.rate),
          actual:   fmt(sgst.rate),
        });
      }
    }
  }

  // ── 4. IGST must not coexist with CGST or SGST/UTGST ─────────────────────
  if (config.enforceIgstExcludesCgstSgst && regime === 'GST') {
    const components = new Set<GstComponent>(
      breakdown
        .map(e => e.gstComponent)
        .filter((c): c is GstComponent => c !== null),
    );

    const hasIgst = components.has('IGST');
    const hasCgst = components.has('CGST');
    const hasSgst = components.has('SGST') || components.has('UTGST');

    if (hasIgst && (hasCgst || hasSgst)) {
      issues.push({
        code:     'TAX_IGST_WITH_CGST_SGST',
        severity: 'error',
        field:    'tax.breakdown',
        message:  'IGST cannot coexist with CGST/SGST/UTGST. ' +
                  'An invoice is either intra-state (CGST + SGST/UTGST) or inter-state (IGST only).',
      });
    }
  }

  // ── 5. Per-entry: taxableAmount × rate / 100 ≈ taxAmount ─────────────────
  for (let i = 0; i < breakdown.length; i++) {
    const entry = breakdown[i];

    if (entry.taxableAmount != null && entry.rate != null && entry.taxAmount != null) {
      const computed = Math.round(entry.taxableAmount * entry.rate / 100 * 100) / 100;
      // Use 2× tolerance: rounding on small individual entries accumulates
      if (!near(computed, entry.taxAmount, tol * 2)) {
        issues.push({
          code:     'TAX_ENTRY_AMOUNT_MISMATCH',
          severity: 'warning',
          field:    `tax.breakdown[${i}].taxAmount`,
          message:  `Tax entry ${i + 1} (${entry.typeNormalized ?? 'unknown'}): ` +
                    `taxAmount (${fmt(entry.taxAmount)}) does not match ` +
                    `taxableAmount × rate / 100 (${fmt(computed)})`,
          expected: fmt(computed),
          actual:   fmt(entry.taxAmount),
        });
      }
    }

    // ── 6. Unusually high rate ──────────────────────────────────────────────
    if (entry.rate != null && entry.rate > 50) {
      issues.push({
        code:     'TAX_ENTRY_HIGH_RATE',
        severity: 'warning',
        field:    `tax.breakdown[${i}].rate`,
        message:  `Tax entry ${i + 1}: rate (${fmt(entry.rate)}%) is unusually high. Verify this is correct.`,
        actual:   fmt(entry.rate),
      });
    }

    // ── 7. Negative tax amount ──────────────────────────────────────────────
    if (entry.taxAmount != null && entry.taxAmount < -tol) {
      issues.push({
        code:     'TAX_NEGATIVE_AMOUNT',
        severity: 'warning',
        field:    `tax.breakdown[${i}].taxAmount`,
        message:  `Tax entry ${i + 1}: taxAmount is negative (${fmt(entry.taxAmount)})`,
        actual:   fmt(entry.taxAmount),
      });
    }
  }

  return issues;
}
