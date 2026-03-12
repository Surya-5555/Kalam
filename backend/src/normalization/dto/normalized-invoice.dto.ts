/**
 * Normalized invoice DTO — the output shape of the normalization layer.
 *
 * Each field group mirrors the canonical invoice sections but wraps
 * "interpreted" fields in a structured envelope:
 *   { raw, normalized, machineReadableValue / days, confidence }
 *
 * Pure numeric fields that require no interpretation (e.g. quantities and
 * amounts already parsed by the AI) are carried through directly with an
 * optional cross-check result where applicable.
 *
 * Import types from the utility files so the DTO stays in sync with them.
 */

export type { NormalizedDate }     from '../utils/date.util';
export type { NormalizedAmount }   from '../utils/amount.util';
export type { NormalizedPaymentTerms } from '../utils/payment-terms.util';
export type { NormalizedState }    from '../utils/state.util';
export type { NormalizedGstin }    from '../utils/gstin.util';

// ─── Tax component classification ────────────────────────────────────────────

/**
 * Identifies the Indian GST component (or other regime type) for a tax entry.
 * Derived deterministically from the tax-entry `type` string.
 */
export type GstComponent = 'CGST' | 'SGST' | 'UTGST' | 'IGST' | 'CESS' | 'VAT' | 'TDS' | 'TCS' | 'OTHER';

/**
 * Best-effort tax regime detected from the tax breakdown entries.
 * Useful for routing the invoice to regime-specific business rules.
 */
export type TaxRegime = 'GST' | 'VAT' | 'SALES_TAX' | 'MIXED' | 'UNKNOWN';

// ─── Re-import the structural types we need ──────────────────────────────────

import type { NormalizedDate }         from '../utils/date.util';
import type { NormalizedPaymentTerms } from '../utils/payment-terms.util';
import type { NormalizedState }        from '../utils/state.util';
import type { NormalizedGstin }        from '../utils/gstin.util';

// ─── Per-section normalized shapes ───────────────────────────────────────────

export interface NormalizedSupplier {
  name: string | null;
  address: string | null;
  city: string | null;
  /** State name normalized to canonical Indian state + ISO/GST codes. */
  state: NormalizedState;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  /** taxId cleaned and validated as GSTIN (if it matches the format). */
  gstin: NormalizedGstin;
  website: string | null;
  confidence: number;
}

export interface NormalizedBuyer {
  name: string | null;
  address: string | null;
  city: string | null;
  state: NormalizedState;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  gstin: NormalizedGstin;
  confidence: number;
}

export interface NormalizedInvoiceHeader {
  number: string | null;
  /** Invoice date parsed to YYYY-MM-DD with epoch and days-from-today. */
  date: NormalizedDate;
  /** Due date parsed to YYYY-MM-DD with epoch and days-from-today. */
  dueDate: NormalizedDate;
  /** ISO 4217 currency code, upper-cased and trimmed. */
  currency: string | null;
  /**
   * Payment terms deeply parsed: standard label, net days, early-payment
   * discount details.
   */
  paymentTerms: NormalizedPaymentTerms;
  purchaseOrderNumber: string | null;
  /**
   * Place of supply normalized as an Indian state.
   * Derived from the buyer's state when no explicit field is available.
   */
  placeOfSupply: NormalizedState;
  notes: string | null;
  confidence: number;
}

export interface NormalizedLineItem {
  lineNumber: number;
  description: string | null;
  /** Quantity as a plain number (already numeric in canonical). */
  quantity: number | null;
  unit: string | null;
  /** Unit price as a plain number. */
  unitPrice: number | null;
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  /**
   * Independently computed total: qty × unitPrice × (1 – discountRate).
   * Used for cross-validation.  null when insufficient data.
   */
  computedTotal: number | null;
  /**
   * true when |total − computedTotal| > 0.01.
   * Always false when either value is null.
   */
  totalMismatch: boolean;
  confidence: number;
}

export interface NormalizedTaxEntry {
  /** Original type string as extracted. */
  typeRaw: string | null;
  /** Cleaned / title-cased type label. */
  typeNormalized: string | null;
  /** GST component classification (CGST, SGST, IGST, …). */
  gstComponent: GstComponent | null;
  rate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: number;
}

export interface NormalizedTax {
  breakdown: NormalizedTaxEntry[];
  totalTaxAmount: number | null;
  /** Inferred tax regime from the breakdown entries. */
  regime: TaxRegime;
}

export interface NormalizedTotals {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  /**
   * Sum of all `NormalizedLineItem.total` values.
   * Useful for cross-checking grandTotal.
   */
  itemsSumTotal: number | null;
  /**
   * true when |grandTotal - (subtotal + totalTax + shippingAndHandling)| > 0.01
   * and all three components are non-null.
   */
  grandTotalMismatch: boolean;
  confidence: number;
}

// ─── Root normalized invoice document ────────────────────────────────────────

export interface NormalizedInvoice {
  /** Always 1; increment when this interface changes. */
  normalizationVersion: 1;
  supplier: NormalizedSupplier;
  buyer: NormalizedBuyer;
  invoice: NormalizedInvoiceHeader;
  items: NormalizedLineItem[];
  tax: NormalizedTax;
  totals: NormalizedTotals;
}
