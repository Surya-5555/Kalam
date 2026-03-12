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
import { DocumentTypeDetectionService } from '../document-type/document-type.service';
import { PdfTextExtractionService } from '../pdf-text-extraction/pdf-text-extraction.service';
import { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import { OcrService } from '../ocr/ocr.service';
import { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { AiExtractionService } from '../ai-extraction/ai-extraction.service';
import { ProcessingStatusService } from '../processing-status/processing-status.service';
import { ProcessingStage } from '../processing-status/dto/processing-stage.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'invoices');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspectionService: DocumentInspectionService,
    private readonly documentTypeService: DocumentTypeDetectionService,
    private readonly pdfTextExtractionService: PdfTextExtractionService,
    private readonly ocrService: OcrService,
    private readonly aiExtractionService: AiExtractionService,
    private readonly processingStatusService: ProcessingStatusService,
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
      this.logger.error(`Failed to save uploaded file: ${msg}`);
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
      this.logger.error(`Failed to create DB records: ${msg}`);
      // Clean up saved file on DB failure
      fs.unlink(filePath, () => undefined);
      throw new BadRequestException('Failed to initiate document processing');
    }

    // Hold a copy of the buffer so the GC won't collect it before the
    // setImmediate callback fires.
    const fileBuffer = Buffer.from(file.buffer);

    // Fire-and-forget: the HTTP response is sent before this completes.
    setImmediate(() => {
      this.runProcessingPipeline(documentId, fileBuffer, inspectionResult).catch(
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Unhandled error in processing pipeline for ${documentId}: ${msg}`,
          );
        },
      );
    });

    this.logger.log(
      `Invoice ${filename} queued for processing (user=${userId}, doc=${documentId})`,
    );

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
  // Background pipeline — runs entirely outside the HTTP request cycle.
  // Each stage updates the ProcessingJob in the DB.
  // On any unrecoverable error, the job and document are marked failed.
  // --------------------------------------------------------------------
  private async runProcessingPipeline(
    documentId: string,
    fileBuffer: Buffer,
    inspectionResult: InspectionResultDto,
  ): Promise<void> {
    let currentStage: ProcessingStage = 'inspection';

    try {
      // ── Stage: inspection (already ran sync; just record timing) ──────
      await this.processingStatusService.startStage(documentId, 'inspection');
      await this.processingStatusService.completeStage(documentId, 'inspection');

      // ── Stage: document_type_detection ────────────────────────────────
      currentStage = 'document_type_detection';
      await this.processingStatusService.startStage(
        documentId,
        'document_type_detection',
      );

      const documentTypeResult = this.documentTypeService.detect(
        fileBuffer,
        inspectionResult.fileType,
      );
      this.logger.log(
        `[${documentId}] doc_type=${documentTypeResult.documentType} ` +
          `method=${documentTypeResult.extractionMethod}`,
      );

      await this.processingStatusService.completeStage(
        documentId,
        'document_type_detection',
      );

      // ── Stage: text_extraction ────────────────────────────────────────
      currentStage = 'text_extraction';
      let textExtractionResult: PdfTextExtractionResultDto | null = null;

      if (documentTypeResult.documentType === 'text-based-pdf') {
        await this.processingStatusService.startStage(
          documentId,
          'text_extraction',
        );
        textExtractionResult = await this.pdfTextExtractionService.extract(
          fileBuffer,
        );
        this.logger.log(
          `[${documentId}] text_extraction: ${textExtractionResult.totalPages}pp ` +
            `${textExtractionResult.extractedCharacterCount} chars`,
        );
        await this.processingStatusService.completeStage(
          documentId,
          'text_extraction',
        );
      } else {
        await this.processingStatusService.skipStage(
          documentId,
          'text_extraction',
        );
      }

      // ── Stage: ocr ───────────────────────────────────────────────────
      currentStage = 'ocr';
      let ocrResult: OcrResultDto | null = null;

      if (documentTypeResult.documentType === 'scanned-pdf') {
        await this.processingStatusService.startStage(documentId, 'ocr');
        ocrResult = await this.ocrService.recognizeScannedPdf(fileBuffer);
        this.logger.log(
          `[${documentId}] ocr(scanned): ${ocrResult.totalPages}pp ` +
            `avg_conf=${ocrResult.averageConfidence}%`,
        );
        await this.processingStatusService.completeStage(documentId, 'ocr');
      } else if (documentTypeResult.documentType === 'image-document') {
        await this.processingStatusService.startStage(documentId, 'ocr');
        ocrResult = await this.ocrService.recognizeImage(fileBuffer);
        this.logger.log(
          `[${documentId}] ocr(image): ${ocrResult.extractedCharacterCount} chars ` +
            `conf=${ocrResult.averageConfidence}%`,
        );
        await this.processingStatusService.completeStage(documentId, 'ocr');
      } else {
        await this.processingStatusService.skipStage(documentId, 'ocr');
      }

      // ── Stage: ai_extraction ─────────────────────────────────────────
      currentStage = 'ai_extraction';
      await this.processingStatusService.startStage(documentId, 'ai_extraction');

      const aiExtractionResult = await this.aiExtractionService.extract(
        textExtractionResult,
        ocrResult,
      );

      this.logger.log(
        `[${documentId}] ai_extraction: status=${aiExtractionResult.status} ` +
          `confidence=${aiExtractionResult.overallConfidence.toFixed(2)}`,
      );

      if (aiExtractionResult.status === 'failed') {
        await this.processingStatusService.completeStage(
          documentId,
          'ai_extraction',
        );
        await this.processingStatusService.failJob(
          documentId,
          'ai_extraction',
          aiExtractionResult.extractionError ??
            'AI extraction returned a failed status',
        );
        await this.prisma.invoiceDocument.update({
          where: { id: documentId },
          data: { status: 'failed' },
        });
        return;
      }

      await this.processingStatusService.completeStage(
        documentId,
        'ai_extraction',
      );

      // ── Stage: normalization (ran inside ai_extraction; mark instantly) ─
      currentStage = 'normalization';
      await this.processingStatusService.startStage(documentId, 'normalization');
      await this.processingStatusService.completeStage(
        documentId,
        'normalization',
      );

      // ── Stage: validation (ran inside ai_extraction; mark instantly) ───
      currentStage = 'validation';
      await this.processingStatusService.startStage(documentId, 'validation');
      await this.processingStatusService.completeStage(documentId, 'validation');

      // ── Persist final result ─────────────────────────────────────────
      const docStatus =
        inspectionResult.qualityWarnings.length > 0
          ? 'needs_review'
          : aiExtractionResult.status === 'success'
            ? 'completed'
            : 'needs_review'; // partial

      await this.prisma.invoiceDocument.update({
        where: { id: documentId },
        data: {
          status: docStatus,
          extractedData: JSON.parse(
            JSON.stringify(aiExtractionResult),
          ) as object,
        },
      });

      await this.processingStatusService.completeJob(documentId);

      this.logger.log(
        `[${documentId}] Pipeline complete — document status: ${docStatus}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${documentId}] Pipeline failed at stage "${currentStage}": ${msg}`,
      );

      await this.processingStatusService.failJob(documentId, currentStage, msg);

      await this.prisma.invoiceDocument
        .update({
          where: { id: documentId },
          data: { status: 'failed' },
        })
        .catch(() => undefined); // best-effort
    }
  }

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
}
