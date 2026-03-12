import type {
  BuyerDetailsDto,
  ExtractedInvoiceDto,
  InvoiceDetailsDto,
  InvoiceTotalsDto,
  LineItemDto,
  SupplierDetailsDto,
  TaxBreakdownDto,
} from '../dto/extracted-invoice.dto';

function emptySupplier(): SupplierDetailsDto {
  return {
    name: null,
    address: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    phone: null,
    email: null,
    taxId: null,
    website: null,
    confidence: 0,
  };
}

function emptyBuyer(): BuyerDetailsDto {
  return {
    name: null,
    address: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    phone: null,
    email: null,
    taxId: null,
    confidence: 0,
  };
}

function emptyInvoice(): InvoiceDetailsDto {
  return {
    invoiceNumber: null,
    invoiceNumberCandidates: null,
    invoiceDate: null,
    dueDate: null,
    purchaseOrderNumber: null,
    currency: null,
    paymentTerms: null,
    paymentTermsDays: null,
    notes: null,
    confidence: 0,
  };
}

function emptyTotals(): InvoiceTotalsDto {
  return {
    subtotal: null,
    totalDiscount: null,
    totalTax: null,
    shippingAndHandling: null,
    grandTotal: null,
    amountPaid: null,
    amountDue: null,
    confidence: 0,
  };
}

function emptyInvoiceDto(): ExtractedInvoiceDto {
  return {
    supplier: emptySupplier(),
    buyer: emptyBuyer(),
    invoice: emptyInvoice(),
    lineItems: [],
    taxBreakdown: [],
    totals: emptyTotals(),
  };
}

function normalizeLines(sourceText: string): string[] {
  return sourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, '').trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseAddressBlock(lines: string[]): { name: string | null; address: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null } {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return {
      name: null,
      address: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    };
  }

  const name = cleaned[0] ?? null;
  const last = cleaned[cleaned.length - 1] ?? '';
  const cityStateZip = last.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  const addressLines = cityStateZip
    ? cleaned.slice(1, -1)
    : cleaned.slice(1);

  return {
    name,
    address: addressLines.length > 0 ? addressLines.join(', ') : null,
    city: cityStateZip?.[1]?.trim() ?? null,
    state: cityStateZip?.[2] ?? null,
    postalCode: cityStateZip?.[3] ?? null,
    country: cityStateZip ? 'USA' : null,
  };
}

function readBlock(lines: string[], startLabel: RegExp, stopLabels: RegExp[]): string[] {
  const startIndex = lines.findIndex((line) => startLabel.test(line));
  if (startIndex === -1) return [];

  const block: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (stopLabels.some((label) => label.test(line))) break;
    block.push(line);
  }
  return block;
}

function findLabeledValue(lines: string[], label: RegExp): string | null {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!label.test(line)) continue;

    const sameLine = line.replace(label, '').replace(/^[:#\-\s]+/, '').trim();
    if (sameLine.length > 0) return sameLine;

    const nextLine = lines[index + 1]?.trim() ?? '';
    if (nextLine.length > 0) return nextLine;
  }
  return null;
}

function extractLineItems(lines: string[]): LineItemDto[] {
  const headerIndex = lines.findIndex(
    (line) => /qty/i.test(line) && /description/i.test(line) && /amount/i.test(line),
  );
  if (headerIndex === -1) return [];

  const items: LineItemDto[] = [];
  for (let index = headerIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^(subtotal|sales tax|total|terms|thank you)/i.test(line)) break;

    const match = line.match(/^(\d+(?:\.\d+)?)\s+(.+?)\s+(\d+(?:\.\d{2})?)\s+(\d+(?:\.\d{2})?)$/);
    if (!match) continue;

    items.push({
      lineNumber: items.length + 1,
      quantity: Number.parseFloat(match[1]),
      description: match[2].trim(),
      unit: null,
      unitPrice: parseAmount(match[3]),
      discount: null,
      discountType: null,
      subtotal: null,
      taxRate: null,
      taxAmount: null,
      total: parseAmount(match[4]),
      confidence: 0.78,
    });
  }

  return items;
}

export function extractInvoiceFromOcrText(sourceText: string): ExtractedInvoiceDto {
  const lines = normalizeLines(sourceText);
  const result = emptyInvoiceDto();

  const supplierBlock = readBlock(lines, /^invoice$/i, [/^bill to$/i, /^ship to$/i, /^invoice\s*(?:#|date)/i]);
  const buyerBlock = readBlock(lines, /^bill to$/i, [/^ship to$/i, /^invoice\s*(?:#|date)/i, /^p\.?o\.?#?$/i, /^due date$/i]);

  const supplier = parseAddressBlock(supplierBlock.filter((line) => !/^logo$/i.test(line)));
  const buyer = parseAddressBlock(buyerBlock);

  result.supplier = {
    ...result.supplier,
    ...supplier,
    confidence: supplier.name ? 0.82 : 0,
  };
  result.buyer = {
    ...result.buyer,
    ...buyer,
    confidence: buyer.name ? 0.78 : 0,
  };

  result.invoice.invoiceNumber = findLabeledValue(lines, /^invoice\s*(?:number|no\.?|#)/i);
  result.invoice.invoiceDate = findLabeledValue(lines, /^invoice\s*date/i);
  result.invoice.purchaseOrderNumber = findLabeledValue(lines, /^p\.?o\.?\s*#?/i);
  result.invoice.dueDate = findLabeledValue(lines, /^due\s*date/i);
  result.invoice.currency = /\$/m.test(sourceText) ? 'USD' : null;

  const paymentTermsLine = lines.find((line) => /payment is due within\s+\d+\s+days/i.test(line)) ?? null;
  if (paymentTermsLine) {
    result.invoice.paymentTerms = paymentTermsLine;
    const days = paymentTermsLine.match(/(\d+)\s+days/i);
    result.invoice.paymentTermsDays = days ? Number.parseInt(days[1], 10) : null;
  }

  result.invoice.confidence = [
    result.invoice.invoiceNumber,
    result.invoice.invoiceDate,
    result.invoice.dueDate,
    result.invoice.purchaseOrderNumber,
  ].some(Boolean)
    ? 0.8
    : 0;

  result.lineItems = extractLineItems(lines);
  result.taxBreakdown = [] as TaxBreakdownDto[];

  const subtotalLine = lines.find((line) => /^subtotal\b/i.test(line)) ?? null;
  const salesTaxLine = lines.find((line) => /^sales tax\b/i.test(line)) ?? null;
  const totalLine = lines.find((line) => /^total\b/i.test(line)) ?? null;

  result.totals.subtotal = parseAmount(subtotalLine?.match(/([\$]?\d+(?:\.\d{2})?)$/)?.[1] ?? null);
  result.totals.totalTax = parseAmount(salesTaxLine?.match(/([\$]?\d+(?:\.\d{2})?)$/)?.[1] ?? null);
  result.totals.grandTotal = parseAmount(totalLine?.match(/([\$]?\d+(?:\.\d{2})?)$/)?.[1] ?? null);
  result.totals.amountDue = result.totals.grandTotal;
  result.totals.confidence = [
    result.totals.subtotal,
    result.totals.totalTax,
    result.totals.grandTotal,
  ].some((value) => value !== null)
    ? 0.82
    : 0;

  return result;
}

function mergeString(primary: string | null, fallback: string | null): string | null {
  return primary && primary.trim().length > 0 ? primary : fallback;
}

function mergeNumber(primary: number | null, fallback: number | null): number | null {
  return primary !== null && primary !== undefined ? primary : fallback;
}

function isNumericDateLiteral(value: string | null): boolean {
  return value != null && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(value.trim());
}

function isClearlyDayFirstDate(value: string | null): boolean {
  if (!isNumericDateLiteral(value)) return false;
  const match = value!.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!match) return false;
  return Number(match[1]) > 12 && Number(match[2]) <= 12;
}

function preferRecoveredDate(
  primary: string | null,
  fallback: string | null,
  companionFallback: string | null,
): string | null {
  if (!fallback) return primary;
  if (!primary) return fallback;

  const primaryLooksIso = /^\d{4}-\d{2}-\d{2}$/.test(primary.trim());
  const fallbackUsesNumericLiteral = isNumericDateLiteral(fallback);
  const fallbackLocaleLooksDayFirst =
    isClearlyDayFirstDate(fallback) || isClearlyDayFirstDate(companionFallback);

  if (primaryLooksIso && fallbackUsesNumericLiteral && fallbackLocaleLooksDayFirst) {
    return fallback;
  }

  return primary;
}

export function mergeRecoveredInvoice(
  primary: ExtractedInvoiceDto,
  fallback: ExtractedInvoiceDto,
): ExtractedInvoiceDto {
  return {
    supplier: {
      ...primary.supplier,
      name: mergeString(primary.supplier.name, fallback.supplier.name),
      address: mergeString(primary.supplier.address, fallback.supplier.address),
      city: mergeString(primary.supplier.city, fallback.supplier.city),
      state: mergeString(primary.supplier.state, fallback.supplier.state),
      country: mergeString(primary.supplier.country, fallback.supplier.country),
      postalCode: mergeString(primary.supplier.postalCode, fallback.supplier.postalCode),
      phone: mergeString(primary.supplier.phone, fallback.supplier.phone),
      email: mergeString(primary.supplier.email, fallback.supplier.email),
      taxId: mergeString(primary.supplier.taxId, fallback.supplier.taxId),
      website: mergeString(primary.supplier.website, fallback.supplier.website),
      confidence: Math.max(primary.supplier.confidence, fallback.supplier.confidence),
    },
    buyer: {
      ...primary.buyer,
      name: mergeString(primary.buyer.name, fallback.buyer.name),
      address: mergeString(primary.buyer.address, fallback.buyer.address),
      city: mergeString(primary.buyer.city, fallback.buyer.city),
      state: mergeString(primary.buyer.state, fallback.buyer.state),
      country: mergeString(primary.buyer.country, fallback.buyer.country),
      postalCode: mergeString(primary.buyer.postalCode, fallback.buyer.postalCode),
      phone: mergeString(primary.buyer.phone, fallback.buyer.phone),
      email: mergeString(primary.buyer.email, fallback.buyer.email),
      taxId: mergeString(primary.buyer.taxId, fallback.buyer.taxId),
      confidence: Math.max(primary.buyer.confidence, fallback.buyer.confidence),
    },
    invoice: {
      ...primary.invoice,
      invoiceNumber: mergeString(primary.invoice.invoiceNumber, fallback.invoice.invoiceNumber),
      invoiceNumberCandidates:
        primary.invoice.invoiceNumberCandidates && primary.invoice.invoiceNumberCandidates.length > 0
          ? primary.invoice.invoiceNumberCandidates
          : fallback.invoice.invoiceNumberCandidates,
      invoiceDate: preferRecoveredDate(
        primary.invoice.invoiceDate,
        fallback.invoice.invoiceDate,
        fallback.invoice.dueDate,
      ),
      dueDate: preferRecoveredDate(
        primary.invoice.dueDate,
        fallback.invoice.dueDate,
        fallback.invoice.invoiceDate,
      ),
      purchaseOrderNumber: mergeString(primary.invoice.purchaseOrderNumber, fallback.invoice.purchaseOrderNumber),
      currency: mergeString(primary.invoice.currency, fallback.invoice.currency),
      paymentTerms: mergeString(primary.invoice.paymentTerms, fallback.invoice.paymentTerms),
      paymentTermsDays: mergeNumber(primary.invoice.paymentTermsDays, fallback.invoice.paymentTermsDays),
      notes: mergeString(primary.invoice.notes, fallback.invoice.notes),
      confidence: Math.max(primary.invoice.confidence, fallback.invoice.confidence),
    },
    lineItems: primary.lineItems.length > 0 ? primary.lineItems : fallback.lineItems,
    taxBreakdown: primary.taxBreakdown.length > 0 ? primary.taxBreakdown : fallback.taxBreakdown,
    totals: {
      ...primary.totals,
      subtotal: mergeNumber(primary.totals.subtotal, fallback.totals.subtotal),
      totalDiscount: mergeNumber(primary.totals.totalDiscount, fallback.totals.totalDiscount),
      totalTax: mergeNumber(primary.totals.totalTax, fallback.totals.totalTax),
      shippingAndHandling: mergeNumber(primary.totals.shippingAndHandling, fallback.totals.shippingAndHandling),
      grandTotal: mergeNumber(primary.totals.grandTotal, fallback.totals.grandTotal),
      amountPaid: mergeNumber(primary.totals.amountPaid, fallback.totals.amountPaid),
      amountDue: mergeNumber(primary.totals.amountDue, fallback.totals.amountDue),
      confidence: Math.max(primary.totals.confidence, fallback.totals.confidence),
    },
  };
}

export function filterRecoveredStructureWarnings(
  warnings: string[],
  recovered: ExtractedInvoiceDto,
): string[] {
  return warnings.filter((warning) => {
    if (!warning.includes('AI response is missing required section')) return true;
    if (warning.includes('"buyer"')) return recovered.buyer.name === null && recovered.buyer.address === null;
    if (warning.includes('"invoice"')) return recovered.invoice.invoiceNumber === null && recovered.invoice.invoiceDate === null && recovered.invoice.dueDate === null;
    if (warning.includes('"lineItems"')) return recovered.lineItems.length === 0;
    if (warning.includes('"taxBreakdown"')) return false;
    if (warning.includes('"totals"')) return recovered.totals.grandTotal === null && recovered.totals.subtotal === null;
    if (warning.includes('"supplier"')) return recovered.supplier.name === null && recovered.supplier.address === null;
    return true;
  });
}

export function computeRecoveredOverallConfidence(
  invoice: ExtractedInvoiceDto,
): number {
  const scores: number[] = [
    invoice.supplier.confidence,
    invoice.buyer.confidence,
    invoice.invoice.confidence,
    invoice.totals.confidence,
  ];

  if (invoice.lineItems.length > 0) {
    const lineAverage =
      invoice.lineItems.reduce((sum, item) => sum + item.confidence, 0) /
      invoice.lineItems.length;
    scores.push(lineAverage);
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}