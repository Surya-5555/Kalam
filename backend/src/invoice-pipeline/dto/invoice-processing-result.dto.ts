import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { ValidationIssue } from '../../business-validation/types';
import type { DuplicateDetectionResult } from '../../duplicate-detection/dto/duplicate-detection-result.dto';
import type { PipelineWarning } from '../../common/pipeline-warning';
import type { RepairRecord } from '../../ai-extraction/schema/invoice-schema.validator';
import type { StageTimings } from './pipeline-io.dto';

/**
 * Flattened validation summary included in the API response.
 * Derived from BusinessValidationResult — avoids exposing allIssues twice.
 */
export interface ValidationSummary {
  /** false when at least one error-severity issue exists. */
  isValid: boolean;
  /** Number of error-severity issues. */
  errorCount: number;
  /** Number of warning-severity issues. */
  warningCount: number;
  /** Full list of error-severity validation issues. */
  errors: ValidationIssue[];
  /** Full list of warning-severity validation issues. */
  warnings: ValidationIssue[];
  /** Total rule functions evaluated. */
  rulesRun: number;
  /** Number of rules that produced zero issues. */
  rulesPassed: number;
}

/**
 * Processing metadata block included in the API response.
 */
export interface ProcessingMetadata {
  documentType: string;
  /** Which upstream stage produced the source text (native-text-extraction | ocr | image-ocr). */
  extractionMethod: string;
  /** LLM model identifier. */
  extractionModel: string;
  /** Mean AI confidence score across all invoice sections (0–1). */
  overallConfidence: number;
  /** Number of characters sent to the LLM. */
  sourceTextLength: number;
  /** Per-field schema repairs performed by the validator. */
  schemaRepairs: RepairRecord[];
  /** Wall-clock duration per stage in milliseconds. */
  stageTimings: StageTimings;
  /** Total pipeline wall-clock time in milliseconds. */
  pipelineDurationMs: number;
  /** ISO 8601 timestamp of when processing completed. */
  processedAt: string;
}

/**
 * Final response contract for GET /invoice/:id/result
 *
 * This is the single source of truth for the processing outcome of a document.
 * All four sections — invoice, validation, warnings, metadata — are populated
 * when status is 'completed' or 'partial', and null when 'failed' or 'processing'.
 */
export interface InvoiceProcessingResultDto {
  /** UUID of the processed document. */
  documentId: string;
  /** Original file name as provided by the uploader. */
  originalName: string;
  /** ISO 8601 upload timestamp. */
  uploadedAt: string;

  /**
   * - 'processing' — pipeline is still running (poll again)
   * - 'completed'  — all stages passed; invoice is high-confidence
   * - 'partial'    — invoice available but has quality warnings
   * - 'failed'     — a required stage failed; invoice is null
   */
  status: 'processing' | 'completed' | 'partial' | 'failed';

  // ── Core output ────────────────────────────────────────────────────────────

  /**
   * Structured, normalized invoice data.
   * null while processing or when status is 'failed'.
   */
  invoice: NormalizedInvoice | null;

  /**
   * Business rule validation summary.
   * null while processing or when status is 'failed'.
   */
  validation: ValidationSummary | null;

  /**
   * All non-fatal pipeline warnings accumulated across every stage.
   * Covers: OCR quality, AI extraction issues, schema repairs, financial
   * integrity problems, and duplicate detection.
   */
  warnings: PipelineWarning[];

  /** Duplicate detection result. null when not yet run or status is 'failed'. */
  duplicates: DuplicateDetectionResult | null;

  // ── Processing metadata ───────────────────────────────────────────────────

  /**
   * Timings, model info, and confidence data for observability.
   * null while processing or when status is 'failed'.
   */
  metadata: ProcessingMetadata | null;

  // ── Failure details ───────────────────────────────────────────────────────

  /** Stage name where the pipeline failed. null unless status is 'failed'. */
  failedAtStage: string | null;
  /** Human-readable failure description. null unless status is 'failed'. */
  failureReason: string | null;
}
