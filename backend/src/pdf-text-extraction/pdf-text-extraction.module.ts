import { Module } from '@nestjs/common';
import { PdfTextExtractionService } from './pdf-text-extraction.service';

@Module({
  providers: [PdfTextExtractionService],
  exports: [PdfTextExtractionService],
})
export class PdfTextExtractionModule {}
