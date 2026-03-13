import { MathematicalValidationService } from './mathematical-validation.service';
import { createNormalizedInvoice } from '../test-utils/normalized-invoice.factory';

describe('MathematicalValidationService', () => {
  it('flags total mismatches without stopping processing', () => {
    const service = new MathematicalValidationService();
    const invoice = createNormalizedInvoice({
      totals: {
        ...createNormalizedInvoice().totals,
        subtotal: 999,
        grandTotal: 1111,
      },
    });

    const result = service.validate(invoice);

    expect(result.issues.some((issue) => issue.code === 'TOTAL_MISMATCH')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'TOTALS_MISMATCH')).toBe(true);
  });
});