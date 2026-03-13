import { Module } from '@nestjs/common';
import { PdfFallbackExtractionService } from './pdf-fallback-extraction.service';

@Module({
  providers: [PdfFallbackExtractionService],
  exports: [PdfFallbackExtractionService],
})
export class PdfFallbackExtractionModule {}
