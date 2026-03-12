import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, HttpCode, HttpStatus, Query, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  // NOTE: :id/status must be defined before :id so NestJS/Express does not
  // try to match 'status' as a document id.
  @Get(':id/status')
  async getProcessingStatus(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.processingStatusService.getStatus(id, userId);
  }

  @Get(':id')
  async getInvoiceById(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.invoiceService.getDocumentById(id, userId);
  }
}
