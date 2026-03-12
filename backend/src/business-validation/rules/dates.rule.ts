import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue, RuleConfig } from '../types';

/**
 * DATES_RULE — validates invoice and due date fields.
 *
 * Error codes:
 *  DATE_INVOICE_UNPARSABLE  – raw invoice date present but couldn't be normalised
 *
 * Warning codes:
 *  DATE_INVOICE_MISSING     – invoice date absent entirely
 *  DATE_INVOICE_FAR_FUTURE  – invoice date > 30 days in the future
 *  DATE_INVOICE_TOO_OLD     – invoice date > 10 years in the past
 *  DATE_DUE_UNPARSABLE      – raw due date present but couldn't be normalised
 *  DATE_DUE_BEFORE_INVOICE  – due date is earlier than invoice date
 */
export function datesRule(
  invoice: NormalizedInvoice,
  _config: RuleConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { date: invoiceDate, dueDate } = invoice.invoice;

  // ── Invoice date ──────────────────────────────────────────────────────────

  // Raw value present but unparsable → error (OCR/AI error or unsupported format)
  if (invoiceDate.raw && !invoiceDate.normalized) {
    issues.push({
      code:     'DATE_INVOICE_UNPARSABLE',
      severity: 'error',
      field:    'invoice.date',
      message:  `Invoice date "${invoiceDate.raw}" could not be parsed to YYYY-MM-DD`,
      actual:   invoiceDate.raw,
    });
  }

  // Date entirely absent
  if (!invoiceDate.raw && !invoiceDate.normalized) {
    issues.push({
      code:     'DATE_INVOICE_MISSING',
      severity: 'warning',
      field:    'invoice.date',
      message:  'Invoice date is missing',
    });
  }

  // More than 30 days in the future (likely extraction error or pre-dated invoice)
  if (invoiceDate.daysFromToday != null && invoiceDate.daysFromToday > 30) {
    issues.push({
      code:     'DATE_INVOICE_FAR_FUTURE',
      severity: 'warning',
      field:    'invoice.date',
      message:  `Invoice date "${invoiceDate.normalized}" is ${invoiceDate.daysFromToday} days in the future`,
      actual:   invoiceDate.normalized ?? undefined,
    });
  }

  // More than 10 years in the past (likely century mis-parse, e.g. 1926 instead of 2026)
  if (invoiceDate.daysFromToday != null && invoiceDate.daysFromToday < -3650) {
    issues.push({
      code:     'DATE_INVOICE_TOO_OLD',
      severity: 'warning',
      field:    'invoice.date',
      message:  `Invoice date "${invoiceDate.normalized}" is more than 10 years in the past. ` +
                `Check for a year parsing error.`,
      actual:   invoiceDate.normalized ?? undefined,
    });
  }

  // ── Due date ──────────────────────────────────────────────────────────────

  // Raw value present but unparsable
  if (dueDate.raw && !dueDate.normalized) {
    issues.push({
      code:     'DATE_DUE_UNPARSABLE',
      severity: 'warning',
      field:    'invoice.dueDate',
      message:  `Due date "${dueDate.raw}" could not be parsed to YYYY-MM-DD`,
      actual:   dueDate.raw,
    });
  }

  // Due date before invoice date
  if (
    invoiceDate.machineReadableValue != null &&
    dueDate.machineReadableValue     != null &&
    dueDate.machineReadableValue < invoiceDate.machineReadableValue
  ) {
    issues.push({
      code:     'DATE_DUE_BEFORE_INVOICE',
      severity: 'warning',
      field:    'invoice.dueDate',
      message:  `Due date (${dueDate.normalized}) is earlier than invoice date (${invoiceDate.normalized})`,
      expected: `>= ${invoiceDate.normalized}`,
      actual:   dueDate.normalized ?? undefined,
    });
  }

  return issues;
}
