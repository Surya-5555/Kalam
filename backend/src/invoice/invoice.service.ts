import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { DocumentInspectionService } from '../inspection/inspection.service';
import { InspectionResultDto } from '../inspection/dto/inspection-result.dto';
import { ProcessingStatusService } from '../processing-status/processing-status.service';
import { InvoicePipelineService } from '../invoice-pipeline/invoice-pipeline.service';
import type { PipelineRunResult } from '../invoice-pipeline/dto/pipeline-io.dto';
import type { InvoiceProcessingResultDto } from '../invoice-pipeline/dto/invoice-processing-result.dto';
import { PipelineLogger } from '../common/pipeline-logger';

@Injectable()
export class InvoiceService {
  /** Structured JSON logger — used for all pipeline stage events. */
  private readonly pipelineLogger = new PipelineLogger(InvoiceService.name);
  /** Plain NestJS logger — used for security events and startup messages. */
  private readonly logger = new Logger(InvoiceService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'invoices');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspectionService: DocumentInspectionService,
    private readonly processingStatusService: ProcessingStatusService,
    private readonly pipelineService: InvoicePipelineService,
  ) {
    this.ensureUploadDirExists();
  }

  private ensureUploadDirExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Receives the uploaded file, runs a synchronous pre-flight inspection for
   * immediate HTTP error feedback, saves the file, creates DB records, then
   * fires off the processing pipeline in the background.
   *
   * Returns immediately with the documentId so the caller can poll
   * GET /invoice/:id/status.
   */
  async processUpload(
    file: Express.Multer.File,
    userId: number,
  ): Promise<{ success: boolean; documentId: string; message: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // ------------------------------------------------------------------
    // Pre-flight: inspection runs synchronously so we can reject bad files
    // with a proper HTTP error before any state is committed.
    // ------------------------------------------------------------------
    const inspectionResult = await this.inspectionService.inspect(file);

    if (inspectionResult.isPasswordProtected) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'PASSWORD_PROTECTED',
        message:
          'The PDF is password-protected. Please remove the password and re-upload.',
        inspectionResult,
      });
    }

    if (inspectionResult.isCorrupted) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'FILE_CORRUPTED',
        message:
          'The file appears to be corrupted or cannot be read. Please re-export and re-upload.',
        inspectionResult,
      });
    }

    if (!inspectionResult.isValid) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_FILE',
        message:
          inspectionResult.qualityWarnings[0] ?? 'The file failed validation.',
        inspectionResult,
      });
    }

    // ------------------------------------------------------------------
    // Persist file + DB records, then hand off to background pipeline.
    // ------------------------------------------------------------------
    const documentId = randomUUID();
    const ext = path.extname(file.originalname);
    const filename = `${documentId}${ext}`;
    const filePath = path.join(this.uploadDir, filename);

    try {
      fs.writeFileSync(filePath, file.buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pipelineLogger.error('upload.file_save.failed', { mimeType: file.mimetype, fileSize: file.size, userId, reason: msg });
      throw new BadRequestException('Failed to save uploaded file');
    }

    try {
      await this.prisma.invoiceDocument.create({
        data: {
          id: documentId,
          userId,
          originalName: file.originalname,
          storedName: filename,
          mimeType: file.mimetype,
          fileSize: file.size,
          storagePath: filePath,
          status: 'processing',
        },
      });

      // Create the processing job — 'uploaded' stage is pre-marked completed,
      // 'inspection' will be completed by the background pipeline first thing.
      await this.processingStatusService.createJob(documentId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pipelineLogger.error('upload.db_create.failed', { mimeType: file.mimetype, fileSize: file.size, userId, reason: msg });
      // Clean up saved file on DB failure
      fs.unlink(filePath, () => undefined);
      throw new BadRequestException('Failed to initiate document processing');
    }

    // Hold a copy of the buffer so the GC won't collect it before the
    // setImmediate callback fires.
    const fileBuffer = Buffer.from(file.buffer);

    // Fire-and-forget: the HTTP response is sent before this completes.
    setImmediate(() => {
      this.runProcessingPipeline(documentId, fileBuffer, inspectionResult, userId).catch(
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.pipelineLogger.withDocId(documentId).error('pipeline.unhandled_error', { reason: msg });
        },
      );
    });

    this.pipelineLogger.withDocId(documentId).event('upload.queued', {
      mimeType: file.mimetype,
      fileSize: file.size,
      userId,
    });

    return {
      success: true,
      documentId,
      message:
        'Invoice uploaded. Processing has started — poll /invoice/' +
        documentId +
        '/status for updates.',
    };
  }

  // --------------------------------------------------------------------
  // Background pipeline — delegates to InvoicePipelineService.
  // This method only handles DB persistence after the orchestrator finishes.
  // All stage logic lives in InvoicePipelineService.run().
  // --------------------------------------------------------------------
  private async runProcessingPipeline(
    documentId: string,
    fileBuffer: Buffer,
    inspectionResult: InspectionResultDto,
    userId: number,
  ): Promise<void> {
    const log = this.pipelineLogger.withDocId(documentId);

    const result = await this.pipelineService.run({
      documentId,
      userId,
      fileBuffer,
      inspectionResult,
    });

    // Map pipeline outcome to the DB document status field.
    const dbStatus =
      result.status === 'failed'
        ? 'failed'
        : result.status === 'partial'
          ? 'needs_review'
          : 'completed';

    await this.prisma.invoiceDocument
      .update({
        where: { id: documentId },
        data: {
          status: dbStatus,
          // Persist the full PipelineRunResult so GET /result can reconstruct
          // the structured response without re-running anything.
          extractedData: JSON.parse(JSON.stringify(result)) as object,
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('pipeline.db_persist_failed', {
          reason: msg,
          pipelineStatus: result.status,
        });
      });
  }

  // ─── Query methods ────────────────────────────────────────────────────────

  async getRecentDocuments(userId: number, limit: number = 10) {
    return this.prisma.invoiceDocument.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      take: limit,
    });
  }

  async getDocumentById(id: string, userId: number) {
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id, userId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  /**
   * Returns the fully structured processing result for a completed document.
   *
   * Maps the stored PipelineRunResult (persisted as JSON by the background
   * pipeline) to the public InvoiceProcessingResultDto response shape,
   * including a flattened validation summary.
   *
   * Returns `{ status: 'processing' }` with null fields when the pipeline is
   * still running — callers should poll /invoice/:id/status instead.
   */
  async getProcessingResult(
    id: string,
    userId: number,
  ): Promise<InvoiceProcessingResultDto> {
    const doc = await this.prisma.invoiceDocument.findFirst({
      where: { id, userId },
      select: {
        id: true,
        originalName: true,
        uploadedAt: true,
        status: true,
        extractedData: true,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    // Pipeline still running — tell the client to poll /status instead.
    if (doc.status === 'processing') {
      return {
        documentId: doc.id,
        originalName: doc.originalName,
        uploadedAt: doc.uploadedAt.toISOString(),
        status: 'processing',
        invoice: null,
        validation: null,
        warnings: [],
        duplicates: null,
        metadata: null,
        failedAtStage: null,
        failureReason: null,
      };
    }

    const stored = doc.extractedData as PipelineRunResult | null;

    // Guard: result data missing (shouldn't happen in normal operation).
    if (!stored) {
      return {
        documentId: doc.id,
        originalName: doc.originalName,
        uploadedAt: doc.uploadedAt.toISOString(),
        status: 'failed',
        invoice: null,
        validation: null,
        warnings: [],
        duplicates: null,
        metadata: null,
        failedAtStage: null,
        failureReason: 'No processing data found',
      };
    }

    // Build the flattened validation summary from BusinessValidationResult.
    const bv = stored.validation;
    const validation = bv
      ? {
          isValid: bv.isValid,
          errorCount: bv.errors.length,
          warningCount: bv.warnings.length,
          errors: bv.errors,
          warnings: bv.warnings,
          rulesRun: bv.rulesRun,
          rulesPassed: bv.rulesPassed,
        }
      : null;

    // Map DB status → API status (needs_review → partial).
    const apiStatus =
      stored.status === 'failed'
        ? 'failed'
        : doc.status === 'needs_review'
          ? 'partial'
          : 'completed';

    return {
      documentId: doc.id,
      originalName: doc.originalName,
      uploadedAt: doc.uploadedAt.toISOString(),
      status: apiStatus,
      invoice: stored.invoice,
      validation,
      warnings: stored.warnings,
      duplicates: stored.duplicateDetection,
      metadata: stored.metadata,
      failedAtStage: stored.failedAtStage,
      failureReason: stored.failureReason,
    };
  }

  async getDocumentFilePath(
    id: string,
    userId: number,
  ): Promise<{ filePath: string; mimeType: string }> {
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id, userId },
      select: { storedName: true, mimeType: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Path-traversal guard: storedName is always a UUID+extension written by
    // processUpload, but we validate defensively so user-controlled input
    // (the :id param) can never escape the upload directory.
    const safeName = path.basename(document.storedName);
    if (safeName !== document.storedName) {
      this.logger.warn(`[security] Suspicious storedName for doc=${id}`);
      throw new NotFoundException('Document not found');
    }

    const filePath = path.join(this.uploadDir, safeName);
    const resolvedFile = path.resolve(filePath);
    const resolvedDir = path.resolve(this.uploadDir);

    // Ensure the resolved path stays inside the upload directory.
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      this.logger.warn(`[security] Path traversal attempt for doc=${id}`);
      throw new NotFoundException('Document not found');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return { filePath, mimeType: document.mimeType };
  }
}
