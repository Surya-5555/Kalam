import { Injectable } from '@nestjs/common';
import type { CanonicalInvoice, CanonicalLineItem, CanonicalTaxEntry } from '../ai-extraction/schema/invoice.schema';
import { normalizeDate }         from './utils/date.util';
import { normalizePaymentTerms } from './utils/payment-terms.util';
import { normalizeState }        from './utils/state.util';
import { normalizeGstin }        from './utils/gstin.util';
import type {
  NormalizedInvoice,
  NormalizedSupplier,
  NormalizedBuyer,
  NormalizedInvoiceHeader,
  NormalizedLineItem,
  NormalizedTaxEntry,
  NormalizedTax,
  NormalizedTotals,
  GstComponent,
  TaxRegime,
} from './dto/normalized-invoice.dto';

// ─── Country normalizer ──────────────────────────────────────────────────────
// Maps common country names / abbreviations to ISO 3166-1 alpha-2.
const COUNTRY_MAP: Record<string, string> = {
  US: 'US', USA: 'US', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', AMERICA: 'US',
  IN: 'IN', IND: 'IN', INDIA: 'IN',
  GB: 'GB', UK: 'GB', 'UNITED KINGDOM': 'GB', 'GREAT BRITAIN': 'GB', ENGLAND: 'GB',
  CA: 'CA', CAN: 'CA', CANADA: 'CA',
  AU: 'AU', AUS: 'AU', AUSTRALIA: 'AU',
  DE: 'DE', DEU: 'DE', GERMANY: 'DE', DEUTSCHLAND: 'DE',
  FR: 'FR', FRA: 'FR', FRANCE: 'FR',
  CN: 'CN', CHN: 'CN', CHINA: 'CN', PRC: 'CN',
  JP: 'JP', JPN: 'JP', JAPAN: 'JP',
  SG: 'SG', SGP: 'SG', SINGAPORE: 'SG',
  AE: 'AE', ARE: 'AE', UAE: 'AE', 'UNITED ARAB EMIRATES': 'AE',
  NZ: 'NZ', NZL: 'NZ', 'NEW ZEALAND': 'NZ',
  ZA: 'ZA', ZAF: 'ZA', 'SOUTH AFRICA': 'ZA',
  BR: 'BR', BRA: 'BR', BRAZIL: 'BR', BRASIL: 'BR',
  MX: 'MX', MEX: 'MX', MEXICO: 'MX',
  MY: 'MY', MYS: 'MY', MALAYSIA: 'MY',
  PH: 'PH', PHL: 'PH', PHILIPPINES: 'PH',
  ID: 'ID', IDN: 'ID', INDONESIA: 'ID',
  TH: 'TH', THA: 'TH', THAILAND: 'TH',
  VN: 'VN', VNM: 'VN', VIETNAM: 'VN', 'VIET NAM': 'VN',
  PK: 'PK', PAK: 'PK', PAKISTAN: 'PK',
  BD: 'BD', BGD: 'BD', BANGLADESH: 'BD',
  LK: 'LK', LKA: 'LK', 'SRI LANKA': 'LK',
  NP: 'NP', NPL: 'NP', NEPAL: 'NP',
};

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const input = raw.trim();
  if (!input) return null;
  const key = input.toUpperCase().replace(/[.,']/g, '').replace(/\s+/g, ' ').trim();
  return COUNTRY_MAP[key] ?? input;
}

@Injectable()
export class NormalizationService {

  normalize(canonical: CanonicalInvoice): NormalizedInvoice {
    const result: NormalizedInvoice = {
      normalizationVersion: 1,
      supplier: this.normalizeSupplier(canonical),
      buyer:    this.normalizeBuyer(canonical),
      invoice:  this.normalizeHeader(canonical),
      items:    canonical.items.map(item => this.normalizeLineItem(item)),
      tax:      this.normalizeTax(canonical),
      totals:   this.normalizeTotals(canonical),
    };

    // Post-normalization date consistency: if due date ends up before invoice
    // date the invoice date was likely parsed as MM/DD when it is really DD/MM.
    // Try swapping day↔month; accept the swap only when it a) places invoice
    // before due date and b) the distance matches the payment terms (±3 days).
    this.correctInvoiceDateIfInconsistent(result);

    return result;
  }

  /** Swaps day and month of the invoice date when due < invoice and the swap
   *  makes the dates logically consistent with the payment terms. */
  private correctInvoiceDateIfInconsistent(invoice: NormalizedInvoice): void {
    const inv = invoice.invoice;
    const idN = inv.date?.normalized;
    const ddN = inv.dueDate?.normalized;
    if (!idN || !ddN) return;

    const invoiceTs = Date.parse(idN);
    const dueTs     = Date.parse(ddN);
    if (isNaN(invoiceTs) || isNaN(dueTs)) return;
    if (dueTs >= invoiceTs) return; // already consistent — nothing to do

    // Parse YYYY-MM-DD parts
    const parts = idN.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return;
    const [, yyyy, mm, dd] = parts;
    const mNum = Number(mm);
    const dNum = Number(dd);

    // Both parts must be ≤ 12 for a day↔month swap to be meaningful.
    if (mNum > 12 || dNum > 12) return;

    const swapped   = `${yyyy}-${dd}-${mm}`; // swap month and day
    const swappedTs = Date.parse(swapped);
    if (isNaN(swappedTs) || swappedTs > dueTs) return;

    // Validate against payment terms if present (allow ± 3 days tolerance).
    const termsDays = inv.paymentTerms?.days;
    if (termsDays != null) {
      const expectedDue = swappedTs + termsDays * 86_400_000;
      if (Math.abs(expectedDue - dueTs) > 3 * 86_400_000) return;
    }

    // Apply the correction in-place; lower confidence since this was auto-inferred.
    inv.date = {
      ...inv.date,
      raw:                 swapped,
      normalized:          swapped,
      confidence:          Math.min(inv.date?.confidence ?? 1, 0.75),
      daysFromToday:       Math.round((swappedTs - Date.now()) / 86_400_000),
      machineReadableValue: swappedTs,
    };
  }

  // ─── Supplier ──────────────────────────────────────────────────────────────

  private normalizeSupplier(canonical: CanonicalInvoice): NormalizedSupplier {
    const s = canonical.supplier;
    return {
      name:       s.name,
      address:    s.address,
      city:       s.city,
      state:      normalizeState(s.state),
      country:    normalizeCountry(s.country),
      postalCode: s.postalCode,
      phone:      s.phone,
      email:      s.email ? s.email.toLowerCase().trim() : null,
      gstin:      normalizeGstin(s.taxId),
      website:    s.website,
      confidence: s.confidence,
    };
  }

  // ─── Buyer ─────────────────────────────────────────────────────────────────

  private normalizeBuyer(canonical: CanonicalInvoice): NormalizedBuyer {
    const b = canonical.buyer;
    return {
      name:       b.name,
      address:    b.address,
      city:       b.city,
      state:      normalizeState(b.state),
      country:    normalizeCountry(b.country),
      postalCode: b.postalCode,
      phone:      b.phone,
      email:      b.email ? b.email.toLowerCase().trim() : null,
      gstin:      normalizeGstin(b.taxId),
      confidence: b.confidence,
    };
  }

  // ─── Invoice header ────────────────────────────────────────────────────────

  private normalizeHeader(canonical: CanonicalInvoice): NormalizedInvoiceHeader {
    const h = canonical.invoice;
    const b = canonical.buyer;

    // Place of supply: use buyer state as the primary source (Indian GST rule:
    // place of supply = location of the buyer for most B2B transactions).
    // Fall back to supplier state if buyer state is absent.
    const posRaw = b.state ?? canonical.supplier.state;
    const placeOfSupply = normalizeState(posRaw);

    return {
      number:           h.number,
      date:             normalizeDate(h.date),
      dueDate:          normalizeDate(h.dueDate),
      currency:         h.currency ? h.currency.toUpperCase().trim() : null,
      paymentTerms:     normalizePaymentTerms(h.paymentTerms),
      purchaseOrderNumber: h.purchaseOrderNumber,
      placeOfSupply,
      notes:            h.notes,
      confidence:       h.confidence,
    };
  }

  // ─── Line items ────────────────────────────────────────────────────────────

  private normalizeLineItem(item: CanonicalLineItem): NormalizedLineItem {
    // Compute an independent total for cross-validation
    let computedTotal: number | null = null;
    if (item.quantity != null && item.unitPrice != null) {
      let subtotal = item.quantity * item.unitPrice;

      if (item.discount != null && item.discountType === 'percentage') {
        subtotal = subtotal * (1 - item.discount / 100);
      } else if (item.discount != null && item.discountType === 'fixed') {
        subtotal = subtotal - item.discount;
      }

      if (item.taxRate != null) {
        computedTotal = subtotal * (1 + item.taxRate / 100);
      } else if (item.taxAmount != null) {
        computedTotal = subtotal + item.taxAmount;
      } else {
        computedTotal = subtotal;
      }

      computedTotal = Math.round(computedTotal * 100) / 100;
    }

    const totalMismatch =
      item.total != null && computedTotal != null
        ? Math.abs(item.total - computedTotal) > 0.01
        : false;

    return {
      lineNumber:    item.lineNumber,
      description:   item.description,
      quantity:      item.quantity,
      unit:          item.unit,
      unitPrice:     item.unitPrice,
      discount:      item.discount,
      discountType:  item.discountType,
      subtotal:      item.subtotal,
      taxRate:       item.taxRate,
      taxAmount:     item.taxAmount,
      total:         item.total,
      computedTotal,
      totalMismatch,
      confidence:    item.confidence,
    };
  }

  // ─── Tax ──────────────────────────────────────────────────────────────────

  private normalizeTaxEntry(entry: CanonicalTaxEntry): NormalizedTaxEntry {
    const gstComponent = entry.type ? this.classifyGstComponent(entry.type) : null;
    const typeNormalized = entry.type
      ? entry.type.toUpperCase().trim()
      : null;

    return {
      typeRaw:        entry.type,
      typeNormalized,
      gstComponent,
      rate:           entry.rate,
      taxableAmount:  entry.taxableAmount,
      taxAmount:      entry.taxAmount,
      confidence:     entry.confidence,
    };
  }

  private classifyGstComponent(type: string): GstComponent | null {
    const upper = type.toUpperCase().replace(/\s+/g, '');
    if (upper.includes('CGST'))  return 'CGST';
    if (upper.includes('SGST'))  return 'SGST';
    if (upper.includes('UTGST')) return 'UTGST';
    if (upper.includes('IGST'))  return 'IGST';
    if (upper.includes('CESS') || upper.includes('CEST')) return 'CESS';
    if (upper.includes('VAT'))   return 'VAT';
    if (upper.includes('TDS'))   return 'TDS';
    if (upper.includes('TCS'))   return 'TCS';
    if (upper.includes('GST'))   return 'CGST'; // generic "GST" → treat as CGST for now
    return 'OTHER';
  }

  private detectTaxRegime(entries: NormalizedTaxEntry[]): TaxRegime {
    if (entries.length === 0) return 'UNKNOWN';

    const components = new Set(
      entries.map(e => e.gstComponent).filter((c): c is GstComponent => c !== null),
    );

    const hasGst = components.has('CGST') || components.has('SGST') ||
                   components.has('IGST') || components.has('UTGST') ||
                   components.has('CESS');
    const hasVat = components.has('VAT');

    // Detect US/Canadian/Australian style sales taxes by their type labels.
    const SALES_TAX_PATTERNS = /sales.?tax|hst|pst|qst|gst.*canada|state.?tax|use.?tax|excise.?tax/i;
    const hasSalesTax = entries.some(
      e => e.typeRaw != null && SALES_TAX_PATTERNS.test(e.typeRaw) && e.gstComponent === 'OTHER',
    );

    if (hasGst && hasVat) return 'MIXED';
    if (hasGst) return 'GST';
    if (hasVat) return 'VAT';
    if (hasSalesTax) return 'SALES_TAX';
    return 'UNKNOWN';
  }

  private normalizeTax(canonical: CanonicalInvoice): NormalizedTax {
    const normalizedEntries = canonical.tax.breakdown.map(e => this.normalizeTaxEntry(e));

    // Derive missing taxableAmount from subtotal when there is exactly one
    // tax entry and the subtotal is known (common for US invoices).
    const subtotal = canonical.totals?.subtotal;
    if (subtotal != null && normalizedEntries.length === 1 && normalizedEntries[0].taxableAmount == null) {
      normalizedEntries[0] = { ...normalizedEntries[0], taxableAmount: subtotal };
    }

    const regime = this.detectTaxRegime(normalizedEntries);

    return {
      breakdown:      normalizedEntries,
      totalTaxAmount: canonical.tax.totalTaxAmount,
      regime,
    };
  }

  // ─── Totals ───────────────────────────────────────────────────────────────

  private normalizeTotals(canonical: CanonicalInvoice): NormalizedTotals {
    const t = canonical.totals;

    // Cross-check: sum of line item totals
    const itemsSumTotal =
      canonical.items.length > 0 && canonical.items.every(i => i.total != null)
        ? Math.round(canonical.items.reduce((acc, i) => acc + (i.total ?? 0), 0) * 100) / 100
        : null;

    // Deterministically fill zero-valued totals when the document arithmetic
    // already proves they are zero rather than merely missing.
    const totalDiscount =
      t.totalDiscount ??
      (itemsSumTotal != null && t.subtotal != null && Math.abs(itemsSumTotal - t.subtotal) <= 0.01
        ? 0
        : null);

    const shippingAndHandling =
      t.shippingAndHandling ??
      (
        t.grandTotal != null &&
        t.subtotal != null &&
        Math.abs(t.grandTotal - (t.subtotal - (totalDiscount ?? 0) + (t.totalTax ?? 0))) <= 0.01
          ? 0
          : null
      );

    const amountPaid =
      t.amountPaid ??
      (
        t.amountDue != null &&
        t.grandTotal != null &&
        Math.abs(t.amountDue - t.grandTotal) <= 0.01
          ? 0
          : null
      );

    const amountDue =
      t.amountDue ??
      (
        t.grandTotal != null && amountPaid === 0
          ? t.grandTotal
          : null
      );

    // Cross-check: grandTotal ≈ subtotal + totalTax + shippingAndHandling
    let grandTotalMismatch = false;
    if (t.grandTotal != null && t.subtotal != null) {
      const tax      = t.totalTax ?? 0;
      const shipping = shippingAndHandling ?? 0;
      const discount = totalDiscount ?? 0;
      const expected = t.subtotal - discount + tax + shipping;
      grandTotalMismatch = Math.abs(t.grandTotal - expected) > 0.01;
    }

    return {
      subtotal:             t.subtotal,
      totalDiscount,
      totalTax:             t.totalTax,
      shippingAndHandling,
      grandTotal:           t.grandTotal,
      amountPaid,
      amountDue,
      itemsSumTotal,
      grandTotalMismatch,
      confidence:           t.confidence,
    };
  }
}
