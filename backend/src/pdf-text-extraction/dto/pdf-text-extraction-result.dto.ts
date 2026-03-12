export class PageTextDto {
  /** 1-based page number */
  pageNumber: number;

  /** Cleaned text content of this page */
  text: string;

  /** Number of printable characters on this page */
  characterCount: number;
}

export class PdfTextExtractionResultDto {
  /** Concatenated text from all pages, separated by page breaks */
  fullText: string;

  /** Per-page text in page order */
  pages: PageTextDto[];

  /** Total number of pages in the PDF */
  totalPages: number;

  /** Total printable characters across all pages */
  extractedCharacterCount: number;

  /**
   * Always 'native-text-extraction' for this service.
   * Scanned PDFs use a separate OCR stage.
   */
  extractionMethod: 'native-text-extraction';

  /** false if the document processed normally; true if a non-fatal fallback occurred */
  hadPartialFailure: boolean;
}
