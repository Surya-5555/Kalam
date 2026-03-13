/**
 * Confidence value 0–1 where:
 *  0.9–1.0  clearly and unambiguously stated
 *  0.6–0.89 likely correct but required minor interpretation
 *  0.3–0.59 reasonable guess from context
 *  0.0–0.29 highly uncertain – consider it unreliable
 */
export type Confidence = number;

export class SupplierDetailsDto {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  /** VAT / GST / EIN / PAN / ABN etc. */
  taxId: string | null;
  /** GSTIN for Indian invoices. */
  gstin: string | null;
  /** PAN for Indian invoices. */
  pan: string | null;
  website: string | null;
  /** Collective confidence for the supplier block (0–1). */
  confidence: Confidence;
}

export class BuyerDetailsDto {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  /** GSTIN for Indian invoices. */
  gstin: string | null;
  /** PAN for Indian invoices. */
  pan: string | null;
  /** Collective confidence for the buyer block (0–1). */
  confidence: Confidence;
}

export class InvoiceDetailsDto {
  /** Primary invoice number as extracted. null if not found. */
  invoiceNumber: string | null;
  /**
   * All invoice number candidates when the text contains multiple plausible
   * values (e.g. both a printed invoice# and a reference#).
   * null or empty when only one candidate was found.
   */
  invoiceNumberCandidates: string[] | null;
  /** ISO 8601 date string (YYYY-MM-DD). null if ambiguous or absent. */
  invoiceDate: string | null;
  /** ISO 8601 date string. null if not found. */
  dueDate: string | null;
  purchaseOrderNumber: string | null;
  /** ISO 4217 currency code (e.g. "USD", "EUR", "INR"). */
  currency: string | null;
  /** Raw payment terms as printed on the invoice. */
  paymentTerms: string | null;
  /**
   * Normalised net-due days derived from paymentTerms.
   * e.g. "Net 30" → 30, "Due on receipt" → 0, unparseable → null.
   */
  paymentTermsDays: number | null;
  /** Place of supply (state/territory). */
  placeOfSupply: string | null;
  notes: string | null;
  /** Bank name for payment. */
  bankName: string | null;
  /** Bank account number. */
  bankAccountNumber: string | null;
  /** IFSC / SWIFT / routing code. */
  bankIfsc: string | null;
  /** Bank branch. */
  bankBranch: string | null;
  /** Confidence for invoice-level metadata (0–1). */
  confidence: Confidence;
}

export class LineItemDto {
  lineNumber: number;
  description: string | null;
  /** HSN or SAC code for Indian GST invoices. */
  hsnCode: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  /** Discount value. Interpretation depends on discountType. */
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  /** Confidence for this individual line item (0–1). */
  confidence: Confidence;
}

export class TaxBreakdownDto {
  /** e.g. "VAT 20%", "GST", "Sales Tax" */
  taxType: string | null;
  /** Tax rate as a plain percentage (20 means 20%). */
  taxRate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: Confidence;
}

export class InvoiceTotalsDto {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  confidence: Confidence;
}

export class ExtractedInvoiceDto {
  supplier: SupplierDetailsDto;
  buyer: BuyerDetailsDto;
  invoice: InvoiceDetailsDto;
  lineItems: LineItemDto[];
  taxBreakdown: TaxBreakdownDto[];
  totals: InvoiceTotalsDto;
}
