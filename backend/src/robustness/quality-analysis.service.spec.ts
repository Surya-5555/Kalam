import { QualityAnalysisService } from './quality-analysis.service';
import { createNormalizedInvoice } from '../test-utils/normalized-invoice.factory';

describe('QualityAnalysisService', () => {
  it('returns needs_review for low-quality extraction scenarios', () => {
    const service = new QualityAnalysisService();
    const invoice = createNormalizedInvoice({ items: [] });

    const result = service.analyze({
      invoice,
      validation: {
        isValid: false,
        errors: [
          {
            code: 'TOTAL_MISMATCH',
            severity: 'error',
            field: 'totals.grandTotal',
            message: 'Mismatch',
          },
        ],
        warnings: [],
        allIssues: [
          {
            code: 'TOTAL_MISMATCH',
            severity: 'error',
            field: 'totals.grandTotal',
            message: 'Mismatch',
          },
        ],
        rulesRun: 5,
        rulesPassed: 4,
      },
      warnings: [{ code: 'MISSING_LINE_ITEMS', message: 'Missing items' }],
      ocrResult: {
        fullText: 'invoice amount 100 total 118',
        pages: [{ pageNumber: 1, text: 'invoice amount 100 total 118', confidence: 52, characterCount: 28 }],
        totalPages: 1,
        extractedCharacterCount: 28,
        averageConfidence: 52,
        extractionMethod: 'image-ocr',
        hadLowConfidence: true,
        hadPartialFailure: false,
      },
      duplicateDetection: null,
      tableCompletenessScore: 0.45,
      fakeFlags: [],
    });

    expect(result.status).toBe('needs_review');
    expect(result.score).toBeLessThan(65);
  });
});