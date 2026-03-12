/**
 * InvoiceSchemaValidator
 *
 * Two concerns are handled here:
 *
 *  1. MAPPING  – Translates the flat ExtractedInvoiceDto (the AI parse result)
 *                onto the canonical CanonicalInvoice shape with renamed keys and
 *                restructured tax section.
 *
 *  2. VALIDATION + REPAIR – After mapping, every field is re-validated against
 *                           strict rules and repaired where safe to do so:
 *
 *     Numbers   – Strings that look numeric are coerced; non-finite values →null.
 *     Arrays    – Non-array values are wrapped in an array or reset to [].
 *     Dates     – ISO 8601 strings are validated; obviously wrong values are
 *                 cleared to null with a warning.
 *     Confidence– Clamped 0–1; non-numeric → 0.
 *     Strings   – Trimmed; empty strings → null.
 *
 * A validation report is returned alongside the canonical invoice so callers
 * can inspect what was repaired vs. what was genuinely missing.
 */

import type { ExtractedInvoiceDto } from '../dto/extracted-invoice.dto';
import type {
  CanonicalInvoice,
  CanonicalSupplier,
  CanonicalBuyer,
  CanonicalInvoiceHeader,
  CanonicalLineItem,
  CanonicalTaxEntry,
  CanonicalTax,
  CanonicalTotals,
  Confidence,
} from './invoice.schema';

// ─── Repair report ────────────────────────────────────────────────────────────

export type RepairSeverity = 'coerced' | 'nulled' | 'defaulted';

export interface RepairRecord {
  /** Dot-path within the canonical invoice, e.g. "totals.grandTotal" */
  field: string;
  severity: RepairSeverity;
  detail: string;
}

export interface SchemaValidationResult {
  /** The fully validated and repaired invoice. */
  canonical: CanonicalInvoice;
  /**
   * true  – schema passed with no repairs or only cosmetic coercions.
   * false – one or more fields had to be nulled or reset.
   */
  isValid: boolean;
  /** Per-field repair log. Empty when isValid is true. */
  repairs: RepairRecord[];
  /** Human-readable summary warnings (a subset of repairs surfaced as strings). */
  warnings: string[];
}

// ─── Primitive coercions ──────────────────────────────────────────────────────

function str(v: unknown, field: string, repairs: RepairRecord[]): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') {
    repairs.push({ field, severity: 'coerced', detail: `${typeof v} coerced to string` });
    return String(v).trim() || null;
  }
  repairs.push({ field, severity: 'nulled', detail: `${typeof v} is not a string — set to null` });
  return null;
}

function num(v: unknown, field: string, repairs: RepairRecord[]): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!isFinite(v)) {
      repairs.push({ field, severity: 'nulled', detail: 'non-finite number set to null' });
      return null;
    }
    return v;
  }
  if (typeof v === 'string') {
    const parsed = parseFloat(v.replace(/,/g, ''));
    if (isFinite(parsed)) {
      repairs.push({ field, severity: 'coerced', detail: `string "${v}" coerced to number` });
      return parsed;
    }
    repairs.push({ field, severity: 'nulled', detail: `string "${v}" is not numeric — set to null` });
    return null;
  }
  repairs.push({ field, severity: 'nulled', detail: `${typeof v} is not a number — set to null` });
  return null;
}

function conf(v: unknown, field: string, repairs: RepairRecord[]): Confidence {
  const n = num(v, field, repairs);
  if (n === null) return 0;
  if (n < 0 || n > 1) {
    repairs.push({ field, severity: 'coerced', detail: `confidence ${n} clamped to [0, 1]` });
    return Math.max(0, Math.min(1, n));
  }
  return n;
}

/** Validates and normalises an ISO 8601 date string (YYYY-MM-DD). */
function isoDate(v: unknown, field: string, repairs: RepairRecord[]): string | null {
  const s = str(v, field, repairs);
  if (s === null) return null;

  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return s;
  }

  // Attempt to repair common formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY etc.
  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) {
    // Heuristic: if first part > 12 it must be DD; otherwise assume DD/MM
    const [, a, b, year] = slash;
    const day = +a > 12 ? a : b;
    const month = +a > 12 ? b : a;
    const repaired = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const d = new Date(repaired);
    if (!isNaN(d.getTime())) {
      repairs.push({ field, severity: 'coerced', detail: `date "${s}" normalised to ISO 8601 "${repaired}"` });
      return repaired;
    }
  }

  repairs.push({ field, severity: 'nulled', detail: `date "${s}" is not ISO 8601 and could not be repaired — set to null` });
  return null;
}

function strArray(v: unknown, field: string, repairs: RepairRecord[]): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) {
    repairs.push({ field, severity: 'coerced', detail: 'expected array — wrapped single value in array' });
    const s = str(v, field, repairs);
    return s ? [s] : null;
  }
  const arr = (v as unknown[]).map((item, i) => str(item, `${field}[${i}]`, repairs)).filter((s): s is string => s !== null);
  return arr.length > 0 ? arr : null;
}

// ─── Discount type guard ──────────────────────────────────────────────────────

function discountType(v: unknown, field: string, repairs: RepairRecord[]): 'percentage' | 'fixed' | null {
  if (v === 'percentage' || v === 'fixed') return v;
  if (v !== null && v !== undefined) {
    repairs.push({ field, severity: 'nulled', detail: `"${v}" is not a valid discountType ('percentage'|'fixed') — set to null` });
  }
  return null;
}

// ─── Section validators ───────────────────────────────────────────────────────

function validateSupplier(raw: ExtractedInvoiceDto['supplier'], repairs: RepairRecord[]): CanonicalSupplier {
  const p = 'supplier';
  return {
    name:       str(raw.name,       `${p}.name`,       repairs),
    address:    str(raw.address,    `${p}.address`,    repairs),
    city:       str(raw.city,       `${p}.city`,       repairs),
    state:      str(raw.state,      `${p}.state`,      repairs),
    country:    str(raw.country,    `${p}.country`,    repairs),
    postalCode: str(raw.postalCode, `${p}.postalCode`, repairs),
    phone:      str(raw.phone,      `${p}.phone`,      repairs),
    email:      str(raw.email,      `${p}.email`,      repairs),
    taxId:      str(raw.taxId,      `${p}.taxId`,      repairs),
    website:    str(raw.website,    `${p}.website`,    repairs),
    confidence: conf(raw.confidence, `${p}.confidence`, repairs),
  };
}

function validateBuyer(raw: ExtractedInvoiceDto['buyer'], repairs: RepairRecord[]): CanonicalBuyer {
  const p = 'buyer';
  return {
    name:       str(raw.name,       `${p}.name`,       repairs),
    address:    str(raw.address,    `${p}.address`,    repairs),
    city:       str(raw.city,       `${p}.city`,       repairs),
    state:      str(raw.state,      `${p}.state`,      repairs),
    country:    str(raw.country,    `${p}.country`,    repairs),
    postalCode: str(raw.postalCode, `${p}.postalCode`, repairs),
    phone:      str(raw.phone,      `${p}.phone`,      repairs),
    email:      str(raw.email,      `${p}.email`,      repairs),
    taxId:      str(raw.taxId,      `${p}.taxId`,      repairs),
    confidence: conf(raw.confidence, `${p}.confidence`, repairs),
  };
}

function validateHeader(raw: ExtractedInvoiceDto['invoice'], repairs: RepairRecord[]): CanonicalInvoiceHeader {
  const p = 'invoice';
  return {
    number:             str(raw.invoiceNumber,  `${p}.number`,           repairs),
    numberCandidates:   strArray(raw.invoiceNumberCandidates, `${p}.numberCandidates`, repairs),
    date:               isoDate(raw.invoiceDate, `${p}.date`,            repairs),
    dueDate:            isoDate(raw.dueDate,     `${p}.dueDate`,         repairs),
    purchaseOrderNumber: str(raw.purchaseOrderNumber, `${p}.purchaseOrderNumber`, repairs),
    currency:           str(raw.currency,       `${p}.currency`,         repairs),
    paymentTerms:       str(raw.paymentTerms,   `${p}.paymentTerms`,     repairs),
    paymentTermsDays:   num(raw.paymentTermsDays, `${p}.paymentTermsDays`, repairs),
    notes:              str(raw.notes,          `${p}.notes`,            repairs),
    confidence:         conf(raw.confidence,    `${p}.confidence`,       repairs),
  };
}

function validateItems(raw: ExtractedInvoiceDto['lineItems'], repairs: RepairRecord[]): CanonicalLineItem[] {
  if (!Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      repairs.push({ field: 'items', severity: 'defaulted', detail: 'lineItems was not an array — reset to []' });
    }
    return [];
  }
  return raw.map((item, idx) => {
    const p = `items[${idx}]`;
    return {
      lineNumber:   typeof item.lineNumber === 'number' && isFinite(item.lineNumber) ? item.lineNumber : idx + 1,
      description:  str(item.description, `${p}.description`, repairs),
      quantity:     num(item.quantity,    `${p}.quantity`,    repairs),
      unit:         str(item.unit,        `${p}.unit`,        repairs),
      unitPrice:    num(item.unitPrice,   `${p}.unitPrice`,   repairs),
      discount:     num(item.discount,    `${p}.discount`,    repairs),
      discountType: discountType(item.discountType, `${p}.discountType`, repairs),
      subtotal:     num(item.subtotal,    `${p}.subtotal`,    repairs),
      taxRate:      num(item.taxRate,     `${p}.taxRate`,     repairs),
      taxAmount:    num(item.taxAmount,   `${p}.taxAmount`,   repairs),
      total:        num(item.total,       `${p}.total`,       repairs),
      confidence:   conf(item.confidence, `${p}.confidence`,  repairs),
    };
  });
}

function validateTax(raw: ExtractedInvoiceDto['taxBreakdown'], repairs: RepairRecord[]): CanonicalTax {
  let breakdown: CanonicalTaxEntry[] = [];

  if (!Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      repairs.push({ field: 'tax.breakdown', severity: 'defaulted', detail: 'taxBreakdown was not an array — reset to []' });
    }
  } else {
    breakdown = raw.map((entry, idx) => {
      const p = `tax.breakdown[${idx}]`;
      return {
        type:          str(entry.taxType,      `${p}.type`,          repairs),
        rate:          num(entry.taxRate,      `${p}.rate`,          repairs),
        taxableAmount: num(entry.taxableAmount, `${p}.taxableAmount`, repairs),
        taxAmount:     num(entry.taxAmount,    `${p}.taxAmount`,     repairs),
        confidence:    conf(entry.confidence,  `${p}.confidence`,    repairs),
      };
    });
  }

  // Compute total from breakdown if entries have taxAmount
  const totalTaxAmount =
    breakdown.length > 0 && breakdown.every(e => e.taxAmount !== null)
      ? breakdown.reduce((sum, e) => sum + (e.taxAmount ?? 0), 0)
      : null;

  return { breakdown, totalTaxAmount };
}

function validateTotals(raw: ExtractedInvoiceDto['totals'], repairs: RepairRecord[]): CanonicalTotals {
  const p = 'totals';
  const totals: CanonicalTotals = {
    subtotal:           num(raw.subtotal,           `${p}.subtotal`,           repairs),
    totalDiscount:      num(raw.totalDiscount,      `${p}.totalDiscount`,      repairs),
    totalTax:           num(raw.totalTax,           `${p}.totalTax`,           repairs),
    shippingAndHandling: num(raw.shippingAndHandling, `${p}.shippingAndHandling`, repairs),
    grandTotal:         num(raw.grandTotal,         `${p}.grandTotal`,         repairs),
    amountPaid:         num(raw.amountPaid,         `${p}.amountPaid`,         repairs),
    amountDue:          num(raw.amountDue,          `${p}.amountDue`,          repairs),
    confidence:         conf(raw.confidence,        `${p}.confidence`,         repairs),
  };

  // Cross-check: if grandTotal and amountDue are both present, warn if
  // amountDue > grandTotal (likely a data error or a partial payment mismatch).
  if (
    totals.grandTotal !== null &&
    totals.amountDue !== null &&
    totals.amountDue > totals.grandTotal + 0.01
  ) {
    repairs.push({
      field: `${p}.amountDue`,
      severity: 'nulled',
      detail: `amountDue (${totals.amountDue}) exceeds grandTotal (${totals.grandTotal}) — likely a data error; amountDue set to null`,
    });
    totals.amountDue = null;
  }

  return totals;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates an ExtractedInvoiceDto against the canonical CanonicalInvoice
 * schema, repairing or nulling fields that fail type or value checks.
 *
 * Never throws — always returns a usable CanonicalInvoice even when every
 * field has been reset to null.
 */
export function validateAndRepair(extracted: ExtractedInvoiceDto): SchemaValidationResult {
  const repairs: RepairRecord[] = [];

  const canonical: CanonicalInvoice = {
    schemaVersion: 1,
    supplier: validateSupplier(extracted.supplier, repairs),
    buyer:    validateBuyer(extracted.buyer,       repairs),
    invoice:  validateHeader(extracted.invoice,    repairs),
    items:    validateItems(extracted.lineItems,   repairs),
    tax:      validateTax(extracted.taxBreakdown,  repairs),
    totals:   validateTotals(extracted.totals,     repairs),
  };

  // Only coercions (non-lossy type changes) are considered non-errors
  const lossyRepairs = repairs.filter(r => r.severity !== 'coerced');
  const isValid = lossyRepairs.length === 0;

  const warnings = lossyRepairs.map(r => `[${r.severity.toUpperCase()}] ${r.field}: ${r.detail}`);

  return { canonical, isValid, repairs, warnings };
}
