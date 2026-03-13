import type { InspectionResultDto } from '../../inspection/dto/inspection-result.dto';
import type { NormalizedInvoice } from '../../normalization/dto/normalized-invoice.dto';
import type { BusinessValidationResult } from '../../business-validation/types';
import type { DuplicateDetectionResult } from '../../duplicate-detection/dto/duplicate-detection-result.dto';
import type { PipelineWarning } from '../../common/pipeline-warning';
import type { RepairRecord } from '../../ai-extraction/schema/invoice-schema.validator';
import type { ProcessingStage } from '../../processing-status/dto/processing-stage.dto';

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * All inputs the pipeline orchestrator needs to run a document through every
 * stage.  Passed from InvoiceService after the file has been saved to disk and
 * the DB record has been created.
 */
export interface PipelineInput {
  /** UUID of the InvoiceDocument record that was just created. */
  documentId: string;
  /** ID of the user who uploaded the document. */
  userId: number;
  /** Raw file bytes — shared across all extraction stages. */
  fileBuffer: Buffer;
  /**
   * Result of the synchronous pre-flight inspection that ran before the HTTP
   * response was sent.  Passed in so the pipeline can record the stage without
   * needing to re-run it.
   */
  inspectionResult: InspectionResultDto;
}

// ─── Stage timing ─────────────────────────────────────────────────────────────

/** Wall-clock duration in milliseconds for each pipeline stage. */
export type StageTimings = Partial<Record<ProcessingStage, number>>;

export interface PipelineEnhancementMetadata {
  pdfFallback?: {
    extractionMethod: 'pdftotext';
    extractedCharacterCount: number;
    pageCount: number;
  };
  preprocessing?: {
    blurScore: number | null;
    isBlurry: boolean;
    orientationDegrees: 0 | 90 | 180 | 270;
    deskewAngle: number;
    preprocessingApplied: string[];
    notes: string[];
  };
  ocrFallback?: {
    engineUsed: string;
    enginesTried: string[];
    fallbackUsed: boolean;
  };
  multiPage?: {
    pageCount: number;
    totalsPageNumber: number | null;
    itemPageNumbers: number[];
  };
  tableReconstruction?: {
    reconstructed: boolean;
    recoveredItemCount: number;
    source: string;
    mergedPages: number;
    completenessScore: number;
  };
  mathValidation?: {
    issueCount: number;
  };
  fraudDetection?: {
    flags: string[];
    issueCount: number;
  };
  qualityAnalysis?: {
    score: number;
    status: 'complete' | 'partial' | 'needs_review' | 'failed';
    reasons: string[];
    missingRequiredFields: string[];
    validationErrorCount: number;
    validationWarningCount: number;
    tableCompletenessScore: number;
    ocrConfidence: number | null;
  };
}

// ─── Metadata ────────────────────────────────────────────────────────────────

/**
 * Processing metadata attached to every PipelineRunResult.
 * Safe to surface to API consumers — contains no PII or extracted content.
 */
export interface PipelineMetadata {
  /** Detected document type (text-based-pdf | scanned-pdf | image-document). */
  documentType: string;
  /** Which upstream stage produced the text sent to the LLM. */
  extractionMethod: string;
  /** LLM model identifier (e.g. "gemini-1.5-pro"). */
  extractionModel: string;
  /** Mean confidence across all sections (0–1). */
  overallConfidence: number;
  /** Number of characters sent to the LLM. */
  sourceTextLength: number;
  /** Per-field repairs the schema validator had to make. */
  schemaRepairs: RepairRecord[];
  /** Wall-clock duration per stage in milliseconds. */
  stageTimings: StageTimings;
  /** Total time from pipeline start to pipeline complete (ms). */
  pipelineDurationMs: number;
  /** ISO 8601 timestamp of when the pipeline completed (or failed). */
  processedAt: string;
  /** Optional additive enhancement metadata produced by plugin modules. */
  enhancements?: PipelineEnhancementMetadata;
}

// ─── Result ──────────────────────────────────────────────────────────────────

/**
 * Structured result returned by InvoicePipelineService.run().
 *
 * This is the canonical output of the processing pipeline and is what gets
 * persisted as InvoiceDocument.extractedData.
 *
 * Consumers should key on `status`:
 *  - 'completed' — all stages passed, high-confidence result
 *  - 'partial'   — result available but with warnings (low OCR confidence,
 *                  possible duplicate, partial AI extraction, etc.)
 *  - 'failed'    — a required stage failed; invoice/validation are null
 */
export interface PipelineRunResult {
  documentId: string;

  /** Overall pipeline outcome. */
  status: 'completed' | 'partial' | 'failed';

  /** Which stage caused the failure. null when status !== 'failed'. */
  failedAtStage: ProcessingStage | null;

  /** Human-readable failure description. null when status !== 'failed'. */
  failureReason: string | null;

  /**
   * Normalized invoice — field-level interpreted output.
   * null only when status is 'failed'.
   */
  invoice: NormalizedInvoice | null;

  /**
   * Business rule validation summary (isValid, errors, warnings).
   * null only when status is 'failed'.
   */
  validation: BusinessValidationResult | null;

  /**
   * Duplicate detection result.
   * null when status is 'failed' or no prior invoices exist to compare.
   */
  duplicateDetection: DuplicateDetectionResult | null;

  /** All non-fatal pipeline warnings accumulated across every stage. */
  warnings: PipelineWarning[];

  /** Processing metadata — timings, model, confidence, repairs. */
  metadata: PipelineMetadata;
}
