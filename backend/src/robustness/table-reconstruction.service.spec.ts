import { TableReconstructionService } from './table-reconstruction.service';
import { createNormalizedInvoice } from '../test-utils/normalized-invoice.factory';

describe('TableReconstructionService', () => {
  it('reconstructs broken multi-page item tables when extracted items are weak', () => {
    const service = new TableReconstructionService();
    const invoice = createNormalizedInvoice({ items: [] });

    const result = service.reconstruct(
      invoice,
      {
        fullText: '',
        pages: [
          {
            pageNumber: 1,
            text: [
              'Description Qty Rate Amount',
              'LED Bulb 10 100 1000',
              'Tube Light',
              '1 200 200',
            ].join('\n'),
            characterCount: 68,
          },
          {
            pageNumber: 2,
            text: [
              'Description Qty Rate Amount',
              'Vacuum Cleaner 1 1000 1000',
              'Grand Total 2714',
            ].join('\n'),
            characterCount: 62,
          },
        ],
        totalPages: 2,
        extractedCharacterCount: 130,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure: false,
      },
      null,
    );

    expect(result.reconstructed).toBe(true);
    expect(result.invoice.items).toHaveLength(3);
    expect(result.invoice.items[1].description).toContain('Tube Light');
    expect(result.mergedPages).toBe(2);
  });
});