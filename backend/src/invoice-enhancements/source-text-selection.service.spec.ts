import { SourceTextSelectionService } from './source-text-selection.service';

describe('SourceTextSelectionService', () => {
  const service = new SourceTextSelectionService();

  it('keeps native PDF text when it is present', () => {
    const textResult = {
      fullText: 'Invoice 1001',
      pages: [],
      totalPages: 1,
      extractedCharacterCount: 12,
      extractionMethod: 'native-text-extraction' as const,
      hadPartialFailure: false,
    };
    const ocrResult = {
      fullText: 'OCR invoice text',
      pages: [],
      totalPages: 1,
      extractedCharacterCount: 16,
      averageConfidence: 87,
      extractionMethod: 'ocr' as const,
      hadLowConfidence: false,
      hadPartialFailure: false,
    };

    const result = service.select(textResult, ocrResult);

    expect(result.textExtractionResult).toBe(textResult);
    expect(result.ocrResult).toBe(ocrResult);
    expect(result.selectedSource).toBe('native-text-extraction');
  });

  it('falls back to OCR when native PDF text is empty', () => {
    const textResult = {
      fullText: '   ',
      pages: [],
      totalPages: 1,
      extractedCharacterCount: 0,
      extractionMethod: 'native-text-extraction' as const,
      hadPartialFailure: false,
    };
    const ocrResult = {
      fullText: 'Invoice from OCR',
      pages: [],
      totalPages: 1,
      extractedCharacterCount: 16,
      averageConfidence: 72,
      extractionMethod: 'ocr' as const,
      hadLowConfidence: false,
      hadPartialFailure: false,
    };

    const result = service.select(textResult, ocrResult);

    expect(result.textExtractionResult).toBeNull();
    expect(result.ocrResult).toBe(ocrResult);
    expect(result.selectedSource).toBe('ocr');
  });

  it('returns none when both sources are empty', () => {
    const result = service.select(
      {
        fullText: '',
        pages: [],
        totalPages: 0,
        extractedCharacterCount: 0,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure: true,
      },
      {
        fullText: ' ',
        pages: [],
        totalPages: 0,
        extractedCharacterCount: 0,
        averageConfidence: 0,
        extractionMethod: 'image-ocr',
        hadLowConfidence: true,
        hadPartialFailure: true,
      },
    );

    expect(result.selectedSource).toBe('none');
  });
});
