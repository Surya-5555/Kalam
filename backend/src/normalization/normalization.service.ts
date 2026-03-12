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

@Injectable()
export class NormalizationService {

  normalize(canonical: CanonicalInvoice): NormalizedInvoice {
    return {
      normalizationVersion: 1,
      supplier: this.normalizeSupplier(canonical),
      buyer:    this.normalizeBuyer(canonical),
      invoice:  this.normalizeHeader(canonical),
      items:    canonical.items.map(item => this.normalizeLineItem(item)),
      tax:      this.normalizeTax(canonical),
      totals:   this.normalizeTotals(canonical),
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
      country:    s.country ? s.country.trim() : null,
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
      country:    b.country ? b.country.trim() : null,
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

    if (hasGst && hasVat) return 'MIXED';
    if (hasGst) return 'GST';
    if (hasVat) return 'VAT';
    return 'UNKNOWN';
  }

  private normalizeTax(canonical: CanonicalInvoice): NormalizedTax {
    const normalizedEntries = canonical.tax.breakdown.map(e => this.normalizeTaxEntry(e));
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

    // Cross-check: grandTotal ≈ subtotal + totalTax + shippingAndHandling
    let grandTotalMismatch = false;
    if (t.grandTotal != null && t.subtotal != null) {
      const tax      = t.totalTax ?? 0;
      const shipping = t.shippingAndHandling ?? 0;
      const discount = t.totalDiscount ?? 0;
      const expected = t.subtotal - discount + tax + shipping;
      grandTotalMismatch = Math.abs(t.grandTotal - expected) > 0.01;
    }

    return {
      subtotal:             t.subtotal,
      totalDiscount:        t.totalDiscount,
      totalTax:             t.totalTax,
      shippingAndHandling:  t.shippingAndHandling,
      grandTotal:           t.grandTotal,
      amountPaid:           t.amountPaid,
      amountDue:            t.amountDue,
      itemsSumTotal,
      grandTotalMismatch,
      confidence:           t.confidence,
    };
  }
}
