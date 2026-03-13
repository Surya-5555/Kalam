/**
 * Machine-readable codes for non-fatal pipeline warnings.
 * Stable across versions — safe to key on in client automation.
 */
export type PipelineWarningCode =
  // OCR quality
  | 'OCR_LOW_CONFIDENCE'
  | 'OCR_PARTIAL_FAILURE'
  | 'OCR_FALLBACK_USED'
  // AI extraction
  | 'AI_EXTRACTION_PARTIAL'
  | 'SCHEMA_REPAIR'
  | 'LOW_OVERALL_CONFIDENCE'
  // Invoice completeness
  | 'MISSING_INVOICE_NUMBER'
  | 'MISSING_INVOICE_DATE'
  | 'MISSING_SUPPLIER_GSTIN'
  | 'MISSING_LINE_ITEMS'
  | 'UNCLEAR_PAYMENT_TERMS'
  // Financial integrity
  | 'TOTALS_MISMATCH'
  | 'LINE_ITEM_TOTAL_MISMATCH'
  | 'TABLE_RECONSTRUCTED'
  | 'GSTIN_INVALID_FORMAT'
  | 'GSTIN_INVALID_CHECKSUM'
  | 'GSTIN_INVALID_STATE_CODE'
  | 'SUSPICIOUS_SUPPLIER'
  | 'SUSPICIOUS_INVOICE_NUMBER'
  | 'INVALID_TAX_STRUCTURE'
  | 'QUALITY_REVIEW_REQUIRED'
  // Duplicate detection
  | 'DUPLICATE_DETECTED'
  | 'DUPLICATE_POSSIBLE';

export interface PipelineWarning {
  /** Stable machine-readable code. */
  code: PipelineWarningCode;
  /** Human-readable, user-facing description. */
  message: string;
  /** Dot-path to the affected field in NormalizedInvoice, if applicable. */
  field?: string | null;
  /** Additional diagnostic context (e.g. computed vs declared values). */
  details?: string | null;
}
