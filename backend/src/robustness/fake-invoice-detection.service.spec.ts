import { FakeInvoiceDetectionService } from './fake-invoice-detection.service';
import { createNormalizedInvoice } from '../test-utils/normalized-invoice.factory';

describe('FakeInvoiceDetectionService', () => {
  it('flags suspicious GST and mixed tax structure issues', () => {
    const service = new FakeInvoiceDetectionService();
    const base = createNormalizedInvoice();
    const result = service.detect({
      ...base,
      supplier: {
        ...base.supplier,
        name: 'Test Supplier',
        gstin: {
          ...base.supplier.gstin,
          raw: '09ABCDE1234F1Z0',
          normalized: '09ABCDE1234F1Z0',
          isChecksumValid: false,
        },
      },
      tax: {
        ...base.tax,
        breakdown: [
          ...base.tax.breakdown,
          {
            typeRaw: 'CGST',
            typeNormalized: 'CGST',
            gstComponent: 'CGST',
            rate: 9,
            taxableAmount: 2300,
            taxAmount: 207,
            confidence: 0.8,
          },
        ],
      },
    });

    expect(result.flags).toContain('supplier-gstin-checksum');
    expect(result.flags).toContain('suspicious-supplier');
    expect(result.flags).toContain('mixed-gst-structure');
  });
});