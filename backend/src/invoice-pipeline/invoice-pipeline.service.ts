import { Injectable } from '@nestjs/common';
import { DocumentTypeDetectionService } from '../document-type/document-type.service';
import { PdfTextExtractionService } from '../pdf-text-extraction/pdf-text-extraction.service';
import { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import { OcrService } from '../ocr/ocr.service';
import { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { AiExtractionService } from '../ai-extraction/ai-extraction.service';
import { AiExtractionResultDto } from '../ai-extraction/dto/ai-extraction-result.dto';
import { DuplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';
import { DuplicateDetectionResult } from '../duplicate-detection/dto/duplicate-detection-result.dto';
import { ProcessingStatusService } from '../processing-status/processing-status.service';
import { ProcessingStage } from '../processing-status/dto/processing-stage.dto';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type { InspectionResultDto } from '../inspection/dto/inspection-result.dto';
import type { PipelineWarning } from '../common/pipeline-warning';
import { PipelineLogger } from '../common/pipeline-logger';
import type {
  PipelineInput,
  PipelineMetadata,
  PipelineRunResult,
  StageTimings,
} from './dto/pipeline-io.dto';

/**
 * InvoicePipelineService
 *
 * The single orchestrator for the invoice processing pipeline.
 * Coordinates every stage in order, wires results between stages, tracks
 * stage status in the DB via ProcessingStatusService, and returns a fully
 * typed PipelineRunResult.
 *
 * Responsibilities:
 *  ✓ Stage sequencing (inspection → duplicate_detection)
 *  ✓ Conditional routing (skip text extraction for images, skip OCR for PDFs)
 *  ✓ Stage status tracking (start / complete / skip / fail)
 *  ✓ Non-fatal error isolation (duplicate detection failures don't fail the job)
 *  ✓ Warning aggregation from all stages
 *  ✓ Metadata collection (timings, model, confidence, repairs)
 *
 * NOT responsible for:
 *  ✗ File I/O (handled by InvoiceService)
 *  ✗ DB document record creation or final persistence (InvoiceService)
 *  ✗ HTTP request/response handling (InvoiceController)
 */
@Injectable()
export class InvoicePipelineService {
  private readonly pipelineLogger = new PipelineLogger(
    InvoicePipelineService.name,
  );

  constructor(
    private readonly documentTypeService: DocumentTypeDetectionService,
    private readonly pdfTextExtractionService: PdfTextExtractionService,
    private readonly ocrService: OcrService,
    private readonly aiExtractionService: AiExtractionService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly processingStatusService: ProcessingStatusService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run the full invoice processing pipeline for the given document.
   *
   * Never throws — all exceptions are caught and returned as a
   * `{ status: 'failed', ... }` result so the caller can always proceed to
   * persist the outcome and mark the DB record accordingly.
   */
  async run(input: PipelineInput): Promise<PipelineRunResult> {
    const { documentId, userId, fileBuffer, inspectionResult } = input;
    const log = this.pipelineLogger.withDocId(documentId);
    const pipelineStart = Date.now();
    const stageTimings: StageTimings = {};

    // ── Stage runner helpers ───────────────────────────────────────────────

    /**
     * Executes a required stage.  Calls startStage before fn(), completes it
     * after.  Any exception propagates to the outer catch → pipeline failure.
     */
    const runStage = async <T>(
      stage: ProcessingStage,
      fn: () => Promise<T> | T,
      startMeta?: Record<string, unknown>,
    ): Promise<T> => {
      log.stageStart(stage, startMeta);
      await this.processingStatusService.startStage(documentId, stage);
      const t0 = Date.now();
      const result = await fn();
      stageTimings[stage] = Date.now() - t0;
      await this.processingStatusService.completeStage(documentId, stage);
      log.stageComplete(stage);
      return result;
    };

    /** Marks a stage as intentionally skipped (e.g. OCR for a text PDF). */
    const skipStage = async (
      stage: ProcessingStage,
      meta?: Record<string, unknown>,
    ): Promise<void> => {
      await this.processingStatusService.skipStage(documentId, stage);
      log.stageSkip(stage, meta);
      stageTimings[stage] = 0;
    };

    let currentStage: ProcessingStage = 'inspection';

    try {
      // ── Stage 1: inspection ──────────────────────────────────────────────
      // The inspection already ran synchronously in InvoiceService.processUpload
      // for immediate HTTP feedback.  We record it as completed here so the
      // processing status reflects the full stage history.
      await runStage(
        'inspection',
        async () => undefined,
        {
          fileType: inspectionResult.fileType,
          qualityWarnings: inspectionResult.qualityWarnings.length,
        },
      );

      // ── Stage 2: document_type_detection ─────────────────────────────────
      currentStage = 'document_type_detection';
      const documentTypeResult = await runStage(
        'document_type_detection',
        () => this.documentTypeService.detect(fileBuffer, inspectionResult.fileType),
      );

      // ── Stage 3: text_extraction ──────────────────────────────────────────
      // Run for ALL PDFs, not just text-based ones.  Modern PDFs store text in
      // FlateDecode-compressed streams — invisible to the raw-byte classifier
      // in DocumentTypeDetectionService but fully decodable by pdfjs
      // getTextContent().  Running here means a PDF wrongly classified as
      // "scanned" still yields usable text for AI extraction.
      // For images there is no text layer, so the stage is skipped.
      currentStage = 'text_extraction';
      let textExtractionResult: PdfTextExtractionResultDto | null = null;

      if (inspectionResult.fileType === 'pdf') {
        textExtractionResult = await runStage(
          'text_extraction',
          () => this.pdfTextExtractionService.extract(fileBuffer),
          { documentType: documentTypeResult.documentType },
        );
      } else {
        await skipStage('text_extraction', {
          documentType: documentTypeResult.documentType,
        });
      }

      // ── Stage 4: ocr (scanned PDFs and images only) ──────────────────────
      // Skip OCR when text extraction already yielded sufficient text — this
      // avoids the expensive canvas-render + Tesseract path for PDFs whose
      // text is in compressed streams but was correctly recovered above.
      currentStage = 'ocr';
      let ocrResult: OcrResultDto | null = null;

      const textExtractionChars = textExtractionResult?.extractedCharacterCount ?? 0;
      const needsOcr =
        documentTypeResult.documentType === 'scanned-pdf' && textExtractionChars < 50;

      if (needsOcr) {
        ocrResult = await runStage(
          'ocr',
          () => this.ocrService.recognizeScannedPdf(fileBuffer),
          { ocrMode: 'scanned-pdf' },
        );
      } else if (documentTypeResult.documentType === 'image-document') {
        ocrResult = await runStage(
          'ocr',
          () => this.ocrService.recognizeImage(fileBuffer),
          { ocrMode: 'image' },
        );
      } else {
        await skipStage('ocr', {
          documentType: documentTypeResult.documentType,
          reason:
            documentTypeResult.documentType === 'scanned-pdf'
              ? 'text extraction recovered sufficient text'
              : undefined,
        });
      }

      // ── Stage 5: ai_extraction ────────────────────────────────────────────
      // Run separately (not through runStage) because AiExtractionService
      // returns a controlled { status: 'failed' } result rather than throwing,
      // which requires different stage-status handling.
      currentStage = 'ai_extraction';
      log.stageStart('ai_extraction');
      await this.processingStatusService.startStage(documentId, 'ai_extraction');
      const aiStart = Date.now();

      const aiResult = await this.aiExtractionService.extract(
        textExtractionResult,
        ocrResult,
      );

      stageTimings['ai_extraction'] = Date.now() - aiStart;

      if (aiResult.status === 'failed') {
        const reason =
          aiResult.extractionError ?? 'AI extraction returned a failed status';
        log.stageFail('ai_extraction', reason, {
          model: aiResult.extractionModel,
        });
        await this.processingStatusService.failJob(
          documentId,
          'ai_extraction',
          reason,
        );
        return this.buildFailedResult(
          documentId,
          'ai_extraction',
          reason,
          stageTimings,
          pipelineStart,
          { extractionModel: aiResult.extractionModel },
        );
      }

      await this.processingStatusService.completeStage(
        documentId,
        'ai_extraction',
      );
      log.stageComplete('ai_extraction', {
        confidence: parseFloat(aiResult.overallConfidence.toFixed(3)),
        model: aiResult.extractionModel,
        warningCount: aiResult.warnings.length,
      });

      // ── Stage 6: normalization ────────────────────────────────────────────
      // Normalization ran as part of AiExtractionService.  We record the stage
      // as instant so the processing status shows it completed.
      currentStage = 'normalization';
      await runStage('normalization', async () => undefined, {
        itemCount: aiResult.normalizedInvoice?.items.length ?? 0,
        taxRegime: aiResult.normalizedInvoice?.tax.regime ?? null,
      });

      // ── Stage 7: validation ────────────────────────────────────────────────
      // Business validation also ran inside AiExtractionService.
      currentStage = 'validation';
      await runStage('validation', async () => undefined, {
        isValid: aiResult.businessValidation?.isValid ?? null,
        errorCount: aiResult.businessValidation?.errors.length ?? 0,
        warningCount: aiResult.businessValidation?.warnings.length ?? 0,
      });

      // ── Stage 8: duplicate_detection ──────────────────────────────────────
      currentStage = 'duplicate_detection';
      const { duplicateDetection, duplicateWarnings } =
        await this.runDuplicateDetection(
          documentId,
          userId,
          aiResult.normalizedInvoice,
          log,
          stageTimings,
        );

      // ── Aggregate all warnings ─────────────────────────────────────────────
      const warnings: PipelineWarning[] = [
        ...aiResult.warnings,
        ...duplicateWarnings,
      ];

      // ── Pipeline complete ──────────────────────────────────────────────────
      const pipelineDurationMs = Date.now() - pipelineStart;
      const status = this.computeStatus(
        inspectionResult,
        aiResult,
        duplicateDetection,
      );

      await this.processingStatusService.completeJob(documentId);
      log.event('pipeline.complete', {
        status,
        pipelineDurationMs,
        warningCount: warnings.length,
      });

      const metadata: PipelineMetadata = {
        documentType: documentTypeResult.documentType,
        extractionMethod: aiResult.sourceTextMethod,
        extractionModel: aiResult.extractionModel,
        overallConfidence: aiResult.overallConfidence,
        sourceTextLength: aiResult.sourceTextLength,
        schemaRepairs: aiResult.schemaRepairs,
        stageTimings,
        pipelineDurationMs,
        processedAt: new Date().toISOString(),
      };

      return {
        documentId,
        status,
        failedAtStage: null,
        failureReason: null,
        invoice: aiResult.normalizedInvoice,
        validation: aiResult.businessValidation,
        duplicateDetection,
        warnings,
        metadata,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.stageFail(currentStage, msg, {
        pipelineDurationMs: Date.now() - pipelineStart,
      });
      await this.processingStatusService.failJob(documentId, currentStage, msg);
      return this.buildFailedResult(
        documentId,
        currentStage,
        msg,
        stageTimings,
        pipelineStart,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Runs duplicate detection as a non-fatal stage.
   * A detection failure is logged but does NOT fail the overall pipeline —
   * the invoice result is still returned without duplicate information.
   */
  private async runDuplicateDetection(
    documentId: string,
    userId: number,
    normalizedInvoice: NormalizedInvoice | null,
    log: PipelineLogger,
    stageTimings: StageTimings,
  ): Promise<{
    duplicateDetection: DuplicateDetectionResult | null;
    duplicateWarnings: PipelineWarning[];
  }> {
    if (!normalizedInvoice) {
      await this.processingStatusService.skipStage(
        documentId,
        'duplicate_detection',
      );
      log.stageSkip('duplicate_detection', { reason: 'no normalized invoice' });
      stageTimings['duplicate_detection'] = 0;
      return { duplicateDetection: null, duplicateWarnings: [] };
    }

    log.stageStart('duplicate_detection');
    await this.processingStatusService.startStage(
      documentId,
      'duplicate_detection',
    );
    const t0 = Date.now();

    let duplicateDetection: DuplicateDetectionResult | null = null;
    const duplicateWarnings: PipelineWarning[] = [];

    try {
      duplicateDetection = await this.duplicateDetectionService.detect(
        normalizedInvoice,
        documentId,
        userId,
      );

      if (duplicateDetection.status === 'exact_duplicate') {
        const first = duplicateDetection.matches[0];
        duplicateWarnings.push({
          code: 'DUPLICATE_DETECTED',
          message:
            `Exact duplicate detected — this invoice matches an existing document` +
            (first
              ? ` (${first.originalName}, uploaded ${first.uploadedAt.substring(0, 10)})`
              : '') +
            `.`,
          details: `matchCount=${duplicateDetection.matches.length}`,
        });
        log.warn('duplicate.exact', {
          matchCount: duplicateDetection.matches.length,
          checkedCount: duplicateDetection.checkedCount,
        });
      } else if (duplicateDetection.status === 'possible_duplicate') {
        duplicateWarnings.push({
          code: 'DUPLICATE_POSSIBLE',
          message:
            `Possible duplicate detected — this invoice is similar to ` +
            `${duplicateDetection.matches.length} existing document(s). ` +
            `Matched fields: ${duplicateDetection.matches[0]?.matchedFields.join(', ') ?? 'unknown'}.`,
          details: `matchCount=${duplicateDetection.matches.length}`,
        });
        log.warn('duplicate.possible', {
          matchCount: duplicateDetection.matches.length,
          checkedCount: duplicateDetection.checkedCount,
          matchedFields: duplicateDetection.matches[0]?.matchedFields ?? [],
        });
      } else {
        log.event('duplicate.none', {
          checkedCount: duplicateDetection.checkedCount,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('duplicate.detection_error', { reason: msg });
      // Non-fatal: pipeline continues without duplicate information
    }

    stageTimings['duplicate_detection'] = Date.now() - t0;
    await this.processingStatusService.completeStage(
      documentId,
      'duplicate_detection',
    );
    log.stageComplete('duplicate_detection', {
      dupeStatus: duplicateDetection?.status ?? 'skipped',
      checkedCount: duplicateDetection?.checkedCount ?? 0,
    });

    return { duplicateDetection, duplicateWarnings };
  }

  /**
   * Determines the overall pipeline status based on qualitative signals across
   * all stages.  A result is 'partial' whenever any warning-class condition is
   * present — e.g. low OCR confidence, possible duplicate, schema repairs.
   * Only a fully clean run with no warnings produces 'completed'.
   */
  private computeStatus(
    inspectionResult: InspectionResultDto,
    aiResult: AiExtractionResultDto,
    duplicateDetection: DuplicateDetectionResult | null,
  ): 'completed' | 'partial' {
    const hasDuplicateSignal =
      duplicateDetection?.status === 'exact_duplicate' ||
      duplicateDetection?.status === 'possible_duplicate';

    if (
      inspectionResult.qualityWarnings.length > 0 ||
      aiResult.status === 'partial' ||
      aiResult.warnings.length > 0 ||
      hasDuplicateSignal
    ) {
      return 'partial';
    }
    return 'completed';
  }

  /**
   * Constructs a minimal PipelineRunResult that represents a hard failure.
   * Always returns `status: 'failed'` with null invoice/validation/duplicates.
   */
  private buildFailedResult(
    documentId: string,
    failedAtStage: ProcessingStage,
    failureReason: string,
    stageTimings: StageTimings,
    pipelineStart: number,
    knownMeta: { extractionModel?: string; documentType?: string } = {},
  ): PipelineRunResult {
    return {
      documentId,
      status: 'failed',
      failedAtStage,
      failureReason,
      invoice: null,
      validation: null,
      duplicateDetection: null,
      warnings: [],
      metadata: {
        documentType: knownMeta.documentType ?? 'unknown',
        extractionMethod: 'unknown',
        extractionModel: knownMeta.extractionModel ?? 'unknown',
        overallConfidence: 0,
        sourceTextLength: 0,
        schemaRepairs: [],
        stageTimings,
        pipelineDurationMs: Date.now() - pipelineStart,
        processedAt: new Date().toISOString(),
      },
    };
  }
}
