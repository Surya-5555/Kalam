import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PrismaService } from 'prisma/prisma.service';
import { InspectionModule } from '../inspection/inspection.module';
import { DocumentTypeModule } from '../document-type/document-type.module';
import { PdfTextExtractionModule } from '../pdf-text-extraction/pdf-text-extraction.module';
import { OcrModule } from '../ocr/ocr.module';
import { AiExtractionModule } from '../ai-extraction/ai-extraction.module';
import { ProcessingStatusModule } from '../processing-status/processing-status.module';

@Module({
  imports: [
    InspectionModule,
    DocumentTypeModule,
    PdfTextExtractionModule,
    OcrModule,
    AiExtractionModule,
    ProcessingStatusModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, PrismaService],
})
export class InvoiceModule {}
