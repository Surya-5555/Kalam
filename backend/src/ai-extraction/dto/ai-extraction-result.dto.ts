import { ExtractedInvoiceDto } from './extracted-invoice.dto';
import type { CanonicalInvoice } from '../schema/invoice.schema';
import type { RepairRecord } from '../schema/invoice-schema.validator';
import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { BusinessValidationResult } from '../../business-validation/types';
import type { DuplicateDetectionResult } from '../../duplicate-detection/dto/duplicate-detection-result.dto';
import type { PipelineWarning } from '../../common/pipeline-warning';

/**
 * 'success' – extraction ran to completion with no structural issues.
 * 'partial' – extraction ran but the AI response had missing sections or
 *             validation warnings.
 * 'failed'  – the LLM call or JSON parse failed entirely.
 */
export type AiExtractionStatus = 'success' | 'partial' | 'failed';

export class AiExtractionResultDto {
  /** Outcome of the extraction attempt. */
  status: AiExtractionStatus;

  /** Fully parsed invoice. Present on 'success' and 'partial'; null on 'failed'. */
  extractedInvoice: ExtractedInvoiceDto | null;

  /**
   * Canonical invoice — the validated, repaired output in the stable schema
   * shape used by all downstream consumers.  null only when status is 'failed'.
   */
  canonicalInvoice: CanonicalInvoice | null;

  /**
   * Per-field repair log produced by the schema validator.
   * Empty when canonicalInvoice required no repairs.
   */
  schemaRepairs: RepairRecord[];

  /**
   * Field-level normalized output produced by the normalization layer.
   * Wraps interpreted fields with { raw, normalized, machineReadableValue/days, confidence }.
   * null only when status is 'failed'.
   */
  normalizedInvoice: NormalizedInvoice | null;

  /**
   * Business rule validation result: isValid, errors[], warnings[].
   * null only when status is 'failed' (no data to validate against).
   */
  businessValidation: BusinessValidationResult | null;

  /** Mean confidence across all sections (0–1). 0 when status is 'failed'. */
  overallConfidence: number;

  /** Non-blocking pipeline warnings. Empty when status is 'failed'. */
  warnings: PipelineWarning[];

  /** LLM model identifier used for this extraction. */
  extractionModel: string;

  /** ISO 8601 timestamp of when extraction ran. */
  extractionTimestamp: string;

  /** Which upstream stage provided the source text. */
  sourceTextMethod: 'native-text-extraction' | 'ocr' | 'image-ocr';

  /** Number of characters sent to the LLM after truncation. */
  sourceTextLength: number;

  /** Human-readable error description when status is 'failed'. null otherwise. */
  extractionError: string | null;

  /**
   * Duplicate detection result produced by the pipeline after extraction.
   * null when extraction failed, or when no prior invoices exist to compare.
   * Set by InvoiceService — not by AiExtractionService itself.
   */
  duplicateDetection: DuplicateDetectionResult | null;
}
