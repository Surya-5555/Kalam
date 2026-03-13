import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import { normalizeDate } from '../normalization/utils/date.util';
import { normalizeGstin } from '../normalization/utils/gstin.util';
import { normalizePaymentTerms } from '../normalization/utils/payment-terms.util';

export function createNormalizedInvoice(
  overrides: Partial<NormalizedInvoice> = {},
): NormalizedInvoice {
  return {
    normalizationVersion: 1,
    supplier: {
      name: 'Sharma Electronics',
      address: 'Main Market Road',
      city: 'Lucknow',
      state: {
        raw: 'Uttar Pradesh',
        normalized: 'Uttar Pradesh',
        isoCode: 'IN-UP',
        gstCode: '09',
        confidence: 0.9,
      },
      country: 'IN',
      postalCode: '226001',
      phone: '+919876543210',
      email: 'sharma@example.com',
      gstin: normalizeGstin('09ABCDE1234F1Z5'),
      website: 'https://supplier.example.com',
      confidence: 0.9,
    },
    buyer: {
      name: 'Gupta Traders',
      address: 'Station Road',
      city: 'Coimbatore',
      state: {
        raw: 'Tamil Nadu',
        normalized: 'Tamil Nadu',
        isoCode: 'IN-TN',
        gstCode: '33',
        confidence: 0.9,
      },
      country: 'IN',
      postalCode: '641001',
      phone: '+919600422401',
      email: 'buyer@example.com',
      gstin: normalizeGstin('33ABCDE1234F1Z5'),
      confidence: 0.9,
    },
    invoice: {
      number: 'INV-2026-0001',
      date: normalizeDate('2026-03-13'),
      dueDate: normalizeDate('2026-03-20'),
      currency: 'INR',
      paymentTerms: normalizePaymentTerms('Net 7'),
      purchaseOrderNumber: 'PO-1001',
      placeOfSupply: {
        raw: 'Tamil Nadu',
        normalized: 'Tamil Nadu',
        isoCode: 'IN-TN',
        gstCode: '33',
        confidence: 0.9,
      },
      notes: null,
      confidence: 0.9,
    },
    items: [
      {
        lineNumber: 1,
        description: 'LED bulb',
        quantity: 10,
        unit: 'pcs',
        unitPrice: 100,
        discount: null,
        discountType: null,
        subtotal: 1000,
        taxRate: 18,
        taxAmount: 180,
        total: 1180,
        computedTotal: 1000,
        totalMismatch: false,
        confidence: 0.9,
      },
    ],
    tax: {
      breakdown: [
        {
          typeRaw: 'IGST',
          typeNormalized: 'IGST',
          gstComponent: 'IGST',
          rate: 18,
          taxableAmount: 2300,
          taxAmount: 414,
          confidence: 0.9,
        },
      ],
      totalTaxAmount: 414,
      regime: 'GST',
    },
    totals: {
      subtotal: 2300,
      totalDiscount: null,
      totalTax: 414,
      shippingAndHandling: 0,
      grandTotal: 2714,
      amountPaid: null,
      amountDue: 2714,
      itemsSumTotal: 1180,
      grandTotalMismatch: false,
      confidence: 0.9,
    },
    ...overrides,
  };
}