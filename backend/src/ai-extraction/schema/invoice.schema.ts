/**
 * Canonical invoice JSON schema — the stable output contract for all consumers.
 *
 * Field naming deliberately matches the target shape requested:
 *   { supplier, invoice, items, tax, totals }
 *
 * This is distinct from ExtractedInvoiceDto (the internal AI parse result) to
 * allow the two representations to evolve independently.
 */

// ─── Leaf types ───────────────────────────────────────────────────────────────

/**
 * Confidence score 0–1.
 *  0.9–1.0  explicitly and unambiguously present in the source text
 *  0.6–0.89 minor interpretation required
 *  0.3–0.59 contextual inference
 *  0.0–0.29 highly uncertain
 */
export type Confidence = number;

// ─── supplier ────────────────────────────────────────────────────────────────

export interface CanonicalSupplier {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  /** VAT / GST / EIN / PAN / ABN or any other tax identifier. */
  taxId: string | null;
  website: string | null;
  confidence: Confidence;
}

// ─── invoice (header) ─────────────────────────────────────────────────────────

export interface CanonicalInvoiceHeader {
  /** Primary invoice number. */
  number: string | null;
  /**
   * When multiple invoice-number candidates were found, all are listed here.
   * null when only one candidate existed.
   */
  numberCandidates: string[] | null;
  /** ISO 8601 date (YYYY-MM-DD). */
  date: string | null;
  /** ISO 8601 date (YYYY-MM-DD). */
  dueDate: string | null;
  purchaseOrderNumber: string | null;
  /** ISO 4217 currency code, e.g. "USD", "EUR", "INR". */
  currency: string | null;
  /** Raw payment terms string as printed on the invoice. */
  paymentTerms: string | null;
  /** Normalised net-due period in whole days. 0 means due-on-receipt. */
  paymentTermsDays: number | null;
  notes: string | null;
  confidence: Confidence;
}

// ─── buyer ────────────────────────────────────────────────────────────────────

export interface CanonicalBuyer {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  confidence: Confidence;
}

// ─── items ────────────────────────────────────────────────────────────────────

export interface CanonicalLineItem {
  /** 1-based sequential line number. */
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  confidence: Confidence;
}

// ─── tax ──────────────────────────────────────────────────────────────────────

export interface CanonicalTaxEntry {
  /** e.g. "VAT 20%", "GST", "Sales Tax" */
  type: string | null;
  /** Plain percentage, e.g. 20 means 20%. */
  rate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: Confidence;
}

export interface CanonicalTax {
  /**
   * Individual tax bands. Empty array when no tax breakdown is present —
   * never null: callers can always iterate safely.
   */
  breakdown: CanonicalTaxEntry[];
  /** Sum of all taxAmount values across breakdown entries. */
  totalTaxAmount: number | null;
}

// ─── totals ────────────────────────────────────────────────────────────────────

export interface CanonicalTotals {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  confidence: Confidence;
}

// ─── Root canonical invoice document ─────────────────────────────────────────

export interface CanonicalInvoice {
  /** Version of this schema. Increment when the shape changes. */
  schemaVersion: 1;
  supplier: CanonicalSupplier;
  buyer: CanonicalBuyer;
  invoice: CanonicalInvoiceHeader;
  /** Line items. Always an array; empty when none could be extracted. */
  items: CanonicalLineItem[];
  tax: CanonicalTax;
  totals: CanonicalTotals;
}
