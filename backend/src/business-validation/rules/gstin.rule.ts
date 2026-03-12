import type { NormalizedInvoice, NormalizedGstin, NormalizedState } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue, RuleConfig } from '../types';

/**
 * GSTIN_RULE — validates GSTIN format, checksum, and consistency.
 *
 * Error codes:
 *  GSTIN_SUPPLIER_MISSING          – supplier GSTIN absent (when required)
 *  GSTIN_SUPPLIER_FORMAT_INVALID   – supplier GSTIN fails 15-char format regex
 *  GSTIN_BUYER_MISSING             – buyer GSTIN absent (when required)
 *  GSTIN_BUYER_FORMAT_INVALID      – buyer GSTIN fails 15-char format regex
 *
 * Warning codes:
 *  GSTIN_SUPPLIER_CHECKSUM_INVALID – supplier GSTIN check digit incorrect
 *  GSTIN_SUPPLIER_STATE_MISMATCH   – supplier GSTIN state code ≠ supplier address state
 *  GSTIN_BUYER_CHECKSUM_INVALID    – buyer GSTIN check digit incorrect
 *  GSTIN_BUYER_STATE_MISMATCH      – buyer GSTIN state code ≠ buyer address state
 *  GSTIN_SUPPLIER_BUYER_IDENTICAL  – supplier and buyer share the same GSTIN
 */
export function gstinRule(
  invoice: NormalizedInvoice,
  config: RuleConfig,
): ValidationIssue[] {
  return [
    ...validateParty(invoice.supplier.gstin, invoice.supplier.state, 'supplier', config),
    ...validateParty(invoice.buyer.gstin,    invoice.buyer.state,    'buyer',    config),
    ...checkIdentical(invoice.supplier.gstin, invoice.buyer.gstin),
  ];
}

function validateParty(
  gstin:  NormalizedGstin,
  state:  NormalizedState,
  party:  'supplier' | 'buyer',
  config: RuleConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const PARTY  = party.toUpperCase() as 'SUPPLIER' | 'BUYER';
  const field  = `${party}.gstin`;
  const required = party === 'supplier' ? config.requireSupplierGstin : config.requireBuyerGstin;

  // ── GSTIN absent ──────────────────────────────────────────────────────────
  if (!gstin.raw) {
    if (required) {
      issues.push({
        code:     `GSTIN_${PARTY}_MISSING`,
        severity: 'error',
        field,
        message:  `${party} GSTIN is required but was not found`,
      });
    }
    // Nothing else to check when absent
    return issues;
  }

  // ── Format invalid ────────────────────────────────────────────────────────
  if (!gstin.isFormatValid) {
    issues.push({
      code:     `GSTIN_${PARTY}_FORMAT_INVALID`,
      severity: 'error',
      field,
      message:  `${party} GSTIN "${gstin.raw}" does not match the required 15-character ` +
                `format: 2-digit state code + 10-char PAN + entity number + Z + check digit`,
      actual:   gstin.raw,
    });
    // Check digit and state-match are irrelevant when format is wrong
    return issues;
  }

  // ── Check digit invalid ───────────────────────────────────────────────────
  if (!gstin.isChecksumValid) {
    issues.push({
      code:     `GSTIN_${PARTY}_CHECKSUM_INVALID`,
      severity: 'warning',
      field,
      message:  `${party} GSTIN "${gstin.normalized}" has an invalid check digit. ` +
                `This may indicate a typo or OCR mis-read.`,
      actual:   gstin.normalized ?? undefined,
    });
  }

  // ── State code in GSTIN vs address state ─────────────────────────────────
  if (
    gstin.stateCode &&
    state.gstCode   &&
    gstin.stateCode !== state.gstCode
  ) {
    issues.push({
      code:     `GSTIN_${PARTY}_STATE_MISMATCH`,
      severity: 'warning',
      field,
      message:  `${party} GSTIN state prefix (${gstin.stateCode}) does not match ` +
                `the ${party}'s address state code (${state.gstCode} — ${state.normalized ?? state.raw ?? 'unknown'})`,
      expected: state.gstCode,
      actual:   gstin.stateCode,
    });
  }

  return issues;
}

function checkIdentical(
  supplierGstin: NormalizedGstin,
  buyerGstin:    NormalizedGstin,
): ValidationIssue[] {
  const sn = supplierGstin.normalized;
  const bn = buyerGstin.normalized;

  if (sn && bn && sn === bn) {
    return [{
      code:     'GSTIN_SUPPLIER_BUYER_IDENTICAL',
      severity: 'warning',
      field:    'supplier.gstin',
      message:  `Supplier and buyer share the same GSTIN (${sn}). This is unusual for a standard B2B invoice.`,
      actual:   sn,
    }];
  }

  return [];
}
