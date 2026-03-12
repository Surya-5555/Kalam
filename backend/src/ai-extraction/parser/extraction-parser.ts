import {
  ExtractedInvoiceDto,
  SupplierDetailsDto,
  BuyerDetailsDto,
  InvoiceDetailsDto,
  LineItemDto,
  TaxBreakdownDto,
  InvoiceTotalsDto,
} from '../dto/extracted-invoice.dto';

// ─── Field-level coercions ────────────────────────────────────────────────────

function clampConfidence(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function nullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  return null;
}

function nullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    // Strip thousands separators before parsing
    const parsed = parseFloat(v.replace(/,/g, ''));
    if (isFinite(parsed)) return parsed;
  }
  return null;
}

function nullableStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const arr = v
    .map(nullableString)
    .filter((s): s is string => s !== null);
  return arr.length > 0 ? arr : null;
}

// ─── Section parsers ──────────────────────────────────────────────────────────

function parseSupplier(raw: unknown): SupplierDetailsDto {
  const r = raw as Record<string, unknown> | null ?? {};
  return {
    name: nullableString(r.name),
    address: nullableString(r.address),
    city: nullableString(r.city),
    state: nullableString(r.state),
    country: nullableString(r.country),
    postalCode: nullableString(r.postalCode),
    phone: nullableString(r.phone),
    email: nullableString(r.email),
    taxId: nullableString(r.taxId),
    website: nullableString(r.website),
    confidence: clampConfidence(r.confidence),
  };
}

function parseBuyer(raw: unknown): BuyerDetailsDto {
  const r = raw as Record<string, unknown> | null ?? {};
  return {
    name: nullableString(r.name),
    address: nullableString(r.address),
    city: nullableString(r.city),
    state: nullableString(r.state),
    country: nullableString(r.country),
    postalCode: nullableString(r.postalCode),
    phone: nullableString(r.phone),
    email: nullableString(r.email),
    taxId: nullableString(r.taxId),
    confidence: clampConfidence(r.confidence),
  };
}

function parseInvoiceDetails(raw: unknown): InvoiceDetailsDto {
  const r = raw as Record<string, unknown> | null ?? {};
  return {
    invoiceNumber: nullableString(r.invoiceNumber),
    invoiceNumberCandidates: nullableStringArray(r.invoiceNumberCandidates),
    invoiceDate: nullableString(r.invoiceDate),
    dueDate: nullableString(r.dueDate),
    purchaseOrderNumber: nullableString(r.purchaseOrderNumber),
    currency: nullableString(r.currency),
    paymentTerms: nullableString(r.paymentTerms),
    paymentTermsDays: nullableNumber(r.paymentTermsDays),
    notes: nullableString(r.notes),
    confidence: clampConfidence(r.confidence),
  };
}

function parseLineItems(raw: unknown): LineItemDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown, idx: number) => {
    const i = item as Record<string, unknown> ?? {};
    const discountType =
      i.discountType === 'percentage' || i.discountType === 'fixed'
        ? i.discountType
        : null;
    return {
      lineNumber:
        typeof i.lineNumber === 'number' ? i.lineNumber : idx + 1,
      description: nullableString(i.description),
      quantity: nullableNumber(i.quantity),
      unit: nullableString(i.unit),
      unitPrice: nullableNumber(i.unitPrice),
      discount: nullableNumber(i.discount),
      discountType,
      subtotal: nullableNumber(i.subtotal),
      taxRate: nullableNumber(i.taxRate),
      taxAmount: nullableNumber(i.taxAmount),
      total: nullableNumber(i.total),
      confidence: clampConfidence(i.confidence),
    };
  });
}

function parseTaxBreakdown(raw: unknown): TaxBreakdownDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    const i = item as Record<string, unknown> ?? {};
    return {
      taxType: nullableString(i.taxType),
      taxRate: nullableNumber(i.taxRate),
      taxableAmount: nullableNumber(i.taxableAmount),
      taxAmount: nullableNumber(i.taxAmount),
      confidence: clampConfidence(i.confidence),
    };
  });
}

function parseTotals(raw: unknown): InvoiceTotalsDto {
  const r = raw as Record<string, unknown> | null ?? {};
  return {
    subtotal: nullableNumber(r.subtotal),
    totalDiscount: nullableNumber(r.totalDiscount),
    totalTax: nullableNumber(r.totalTax),
    shippingAndHandling: nullableNumber(r.shippingAndHandling),
    grandTotal: nullableNumber(r.grandTotal),
    amountPaid: nullableNumber(r.amountPaid),
    amountDue: nullableNumber(r.amountDue),
    confidence: clampConfidence(r.confidence),
  };
}

// ─── Structural validation ────────────────────────────────────────────────────

const REQUIRED_SECTIONS = [
  'supplier',
  'buyer',
  'invoice',
  'lineItems',
  'taxBreakdown',
  'totals',
] as const;

function validateStructure(obj: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  for (const key of REQUIRED_SECTIONS) {
    if (obj[key] === undefined || obj[key] === null) {
      warnings.push(`AI response is missing required section: "${key}"`);
    }
  }
  return warnings;
}

// ─── Overall confidence ───────────────────────────────────────────────────────

function computeOverallConfidence(invoice: ExtractedInvoiceDto): number {
  const scores: number[] = [
    invoice.supplier.confidence,
    invoice.buyer.confidence,
    invoice.invoice.confidence,
    invoice.totals.confidence,
  ];

  if (invoice.lineItems.length > 0) {
    const lineAvg =
      invoice.lineItems.reduce((sum, li) => sum + li.confidence, 0) /
      invoice.lineItems.length;
    scores.push(lineAvg);
  }

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult {
  invoice: ExtractedInvoiceDto;
  overallConfidence: number;
  warnings: string[];
}

/**
 * Parses, validates, and normalises the raw LLM text response into a typed
 * ExtractedInvoiceDto.
 *
 * - Strips markdown code fences before parsing
 * - Validates all required sections are present
 * - Normalises every field via coercion helpers
 * - Computes a weighted overall confidence score
 *
 * @throws {Error} if the response cannot be parsed as valid JSON.
 */
export function parseExtractionResponse(rawResponse: string): ParseResult {
  // Strip optional markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = rawResponse.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse AI response as JSON: ${(err as Error).message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AI response JSON root must be an object, not an array or primitive');
  }

  const warnings = validateStructure(parsed);

  const invoice: ExtractedInvoiceDto = {
    supplier: parseSupplier(parsed.supplier),
    buyer: parseBuyer(parsed.buyer),
    invoice: parseInvoiceDetails(parsed.invoice),
    lineItems: parseLineItems(parsed.lineItems),
    taxBreakdown: parseTaxBreakdown(parsed.taxBreakdown),
    totals: parseTotals(parsed.totals),
  };

  const overallConfidence = computeOverallConfidence(invoice);
  return { invoice, overallConfidence, warnings };
}
