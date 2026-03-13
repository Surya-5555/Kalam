import { Injectable } from '@nestjs/common';
import type { ValidationIssue } from '../business-validation/types';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type { PipelineWarning } from '../common/pipeline-warning';

export interface MathematicalValidationResult {
  issues: ValidationIssue[];
  warnings: PipelineWarning[];
}

@Injectable()
export class MathematicalValidationService {
  validate(invoice: NormalizedInvoice): MathematicalValidationResult {
    const issues: ValidationIssue[] = [];
    const warnings: PipelineWarning[] = [];
    const tolerance = 0.01;

    const itemSubtotal = invoice.items.reduce((sum, item) => {
      const value = item.subtotal ?? item.computedTotal ?? item.total ?? 0;
      return sum + value;
    }, 0);

    if (
      invoice.totals.subtotal != null &&
      invoice.items.length > 0 &&
      Math.abs(itemSubtotal - invoice.totals.subtotal) > tolerance
    ) {
      issues.push({
        code: 'TOTAL_MISMATCH',
        severity: 'error',
        field: 'totals.subtotal',
        message: 'Sum of item totals does not match subtotal.',
        expected: itemSubtotal.toFixed(2),
        actual: invoice.totals.subtotal.toFixed(2),
      });
      warnings.push({
        code: 'TOTALS_MISMATCH',
        message: 'Line-item subtotal does not match the declared subtotal.',
        field: 'totals.subtotal',
        details: `itemsSubtotal=${itemSubtotal.toFixed(2)}, subtotal=${invoice.totals.subtotal.toFixed(2)}`,
      });
    }

    const subtotal = invoice.totals.subtotal ?? (itemSubtotal || null);
    const totalTax = invoice.totals.totalTax ?? 0;
    const shipping = invoice.totals.shippingAndHandling ?? 0;
    const computedGrandTotal = subtotal != null
      ? Math.round((subtotal + totalTax + shipping) * 100) / 100
      : null;

    if (
      computedGrandTotal != null &&
      invoice.totals.grandTotal != null &&
      Math.abs(computedGrandTotal - invoice.totals.grandTotal) > tolerance
    ) {
      issues.push({
        code: 'TOTAL_MISMATCH',
        severity: 'error',
        field: 'totals.grandTotal',
        message: 'Subtotal plus tax does not equal grand total.',
        expected: computedGrandTotal.toFixed(2),
        actual: invoice.totals.grandTotal.toFixed(2),
      });
      warnings.push({
        code: 'TOTALS_MISMATCH',
        message: 'Subtotal + tax + shipping does not equal the grand total.',
        field: 'totals.grandTotal',
        details: `computed=${computedGrandTotal.toFixed(2)}, grandTotal=${invoice.totals.grandTotal.toFixed(2)}`,
      });
    }

    return { issues, warnings };
  }
}