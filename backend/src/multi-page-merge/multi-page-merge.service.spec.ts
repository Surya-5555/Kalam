import { MultiPageMergeService } from './multi-page-merge.service';

describe('MultiPageMergeService', () => {
  it('tracks page order and detects the totals page', () => {
    const service = new MultiPageMergeService();

    const result = service.merge(
      {
        fullText: '',
        pages: [
          { pageNumber: 1, text: 'Item Qty Amount\nWidget 1 100', characterCount: 27 },
          { pageNumber: 2, text: 'Grand Total 118\nAmount Due 118', characterCount: 30 },
        ],
        totalPages: 2,
        extractedCharacterCount: 57,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure: false,
      },
      null,
    );

    expect(result.pageCount).toBe(2);
    expect(result.totalsPageNumber).toBe(2);
    expect(result.itemPageNumbers).toContain(1);
  });
});