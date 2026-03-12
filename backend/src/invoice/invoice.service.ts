import { Injectable, BadRequestException, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { DocumentInspectionService } from '../inspection/inspection.service';
import { InspectionResultDto } from '../inspection/dto/inspection-result.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'invoices');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspectionService: DocumentInspectionService,
  ) {
    this.ensureUploadDirExists();
  }

  private ensureUploadDirExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async processUpload(
    file: Express.Multer.File,
    userId: number,
  ): Promise<{
    success: boolean;
    documentId: string;
    message: string;
    inspectionResult: InspectionResultDto;
  }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // -------------------------------------------------------------------
    // Document inspection – runs before anything is persisted
    // -------------------------------------------------------------------
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
      // Catches unsupported format and oversized files
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_FILE',
        message: inspectionResult.qualityWarnings[0] ?? 'The file failed validation.',
        inspectionResult,
      });
    }

    // -------------------------------------------------------------------
    // Persist to disk and database
    // -------------------------------------------------------------------
    try {
      const documentId = randomUUID();
      const ext = path.extname(file.originalname);
      const filename = `${documentId}${ext}`;
      const filePath = path.join(this.uploadDir, filename);

      fs.writeFileSync(filePath, file.buffer);

      const invoice = await this.prisma.invoiceDocument.create({
        data: {
          id: documentId,
          userId: userId,
          originalName: file.originalname,
          storedName: filename,
          mimeType: file.mimetype,
          fileSize: file.size,
          storagePath: filePath,
          // Files with quality warnings still enter the pipeline but are
          // flagged for manual review downstream.
          status: inspectionResult.qualityWarnings.length > 0 ? 'needs_review' : 'pending',
        },
      });

      this.logger.log(`Invoice uploaded: ${filename} (user ${userId}, next step: ${inspectionResult.nextRecommendedStep})`);

      const hasWarnings = inspectionResult.qualityWarnings.length > 0;
      return {
        success: true,
        documentId: invoice.id,
        message: hasWarnings
          ? 'Invoice uploaded with quality warnings. Manual review may be required before extraction.'
          : 'Invoice uploaded successfully and is pending processing.',
        inspectionResult,
      };
    } catch (error) {
      this.logger.error(`Error saving uploaded file or DB record: ${error.message}`);
      throw new BadRequestException('Failed to process uploaded file');
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
