import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, HttpCode, HttpStatus, Query, Logger, StreamableFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { InvoiceService } from './invoice.service';
import { ProcessingStatusService } from '../processing-status/processing-status.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('invoice')
@UseGuards(JwtAuthGuard) // Protect all endpoints
export class InvoiceController {
  private readonly logger = new Logger(InvoiceController.name);
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly processingStatusService: ProcessingStatusService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file')) // Expects a form-data field named 'file'
  async uploadInvoice(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
          new FileTypeValidator({ fileType: /^(application\/pdf|image\/jpeg|image\/png|image\/jpg)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @GetUser('id') userId: number,
  ) {
    return this.invoiceService.processUpload(file, userId);
  }

  @Get('recent')
  async getRecentInvoices(
    @GetUser('id') userId: number,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(`Fetching recent invoices for user: ${userId}, limit: ${limit}`);
    return this.invoiceService.getRecentDocuments(userId, limit ? Number(limit) : 10);
  }

  // NOTE: :id/file and :id/status must be defined before :id so NestJS/Express
  // does not try to match those sub-paths as a bare document id.
  @Get(':id/file')
  async serveInvoiceFile(
    @Param('id') id: string,
    @GetUser('id') userId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filePath, mimeType } = await this.invoiceService.getDocumentFilePath(id, userId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id/status')
  async getProcessingStatus(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.processingStatusService.getStatus(id, userId);
  }

  /**
   * GET /invoice/:id/result
   *
   * Returns the fully structured processing result once the pipeline is done.
   *
   * Response contract: InvoiceProcessingResultDto
   *  - status: 'processing' | 'completed' | 'partial' | 'failed'
   *  - invoice: NormalizedInvoice | null
   *  - validation: ValidationSummary | null
   *  - warnings: PipelineWarning[]
   *  - duplicates: DuplicateDetectionResult | null
   *  - metadata: ProcessingMetadata | null
   *
   * When status === 'processing', all content fields are null.
   * Poll GET /:id/status for stage-level progress; call this endpoint once
   * status transitions to completed/partial/failed.
   */
  @Get(':id/result')
  async getProcessingResult(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.invoiceService.getProcessingResult(id, userId);
  }

  @Get(':id')
  async getInvoiceById(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.invoiceService.getDocumentById(id, userId);
  }
}
