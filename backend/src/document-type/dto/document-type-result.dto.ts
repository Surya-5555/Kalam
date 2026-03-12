/**
 * text-based-pdf  – PDF with embedded, machine-readable text (native extraction)
 * scanned-pdf     – PDF whose pages are rasterised images; needs OCR
 * image-document  – JPEG or PNG file; needs OCR
 */
export type DocumentType = 'text-based-pdf' | 'scanned-pdf' | 'image-document';

/**
 * native-text-extraction – text can be pulled directly from the PDF object model
 * ocr                    – image-based extraction pipeline required (scanned PDF)
 * image-ocr              – image-based extraction pipeline required (raster image)
 */
export type ExtractionMethod = 'native-text-extraction' | 'ocr' | 'image-ocr';

export class DocumentTypeResultDto {
  /** Classified document type */
  documentType: DocumentType;

  /** Human-readable explanation of why this classification was chosen */
  detectionReason: string;

  /** Recommended extraction method for the downstream pipeline */
  extractionMethod: ExtractionMethod;

  /**
   * Approximate number of printable characters found in uncompressed PDF
   * content streams. Only meaningful for PDF inputs; 0 for image files.
   */
  extractedTextLength: number;
}
