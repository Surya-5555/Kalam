import { Module } from '@nestjs/common';
import { InvoicePipelineService } from './invoice-pipeline.service';
import { DocumentTypeModule } from '../document-type/document-type.module';
import { PdfTextExtractionModule } from '../pdf-text-extraction/pdf-text-extraction.module';
import { OcrModule } from '../ocr/ocr.module';
import { AiExtractionModule } from '../ai-extraction/ai-extraction.module';
import { DuplicateDetectionModule } from '../duplicate-detection/duplicate-detection.module';
import { ProcessingStatusModule } from '../processing-status/processing-status.module';

/**
 * InvoicePipelineModule
 *
 * Bundles the pipeline orchestrator together with all stage modules it depends
 * on.  Importing this module into InvoiceModule (or any other module) makes
 * InvoicePipelineService available for injection, ready to run the full
 * document processing pipeline end-to-end.
 */
@Module({
  imports: [
    DocumentTypeModule,
    PdfTextExtractionModule,
    OcrModule,
    AiExtractionModule,
    DuplicateDetectionModule,
    ProcessingStatusModule,
  ],
  providers: [InvoicePipelineService],
  exports: [InvoicePipelineService],
})
export class InvoicePipelineModule {}
