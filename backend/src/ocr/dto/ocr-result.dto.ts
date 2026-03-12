export class OcrPageResultDto {
  /** 1-based page number */
  pageNumber: number;

  /** OCR text content of this page after cleaning */
  text: string;

  /** Mean word-level confidence 0–100 as reported by Tesseract */
  confidence: number;

  /** Number of printable characters on this page */
  characterCount: number;
}

/**
 * 'ocr'       – source was a scanned PDF (pages rendered to images first)
 * 'image-ocr' – source was a JPEG/PNG file
 */
export type OcrExtractionMethod = 'ocr' | 'image-ocr';

export class OcrResultDto {
  /** Concatenated OCR text from all pages, separated by page breaks */
  fullText: string;

  /** Per-page OCR results in page order */
  pages: OcrPageResultDto[];

  /** Total pages processed */
  totalPages: number;

  /** Total printable characters across all pages */
  extractedCharacterCount: number;

  /** Mean confidence across all pages (0–100) */
  averageConfidence: number;

  /** Which pipeline produced this result */
  extractionMethod: OcrExtractionMethod;

  /**
   * True when at least one page had confidence below the LOW_CONFIDENCE
   * threshold or produced no text.
   */
  hadLowConfidence: boolean;

  /** True when at least one page failed to process and was skipped */
  hadPartialFailure: boolean;
}
