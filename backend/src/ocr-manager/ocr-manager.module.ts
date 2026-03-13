import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module';
import { InvoicePreprocessingModule } from '../invoice-preprocessing/invoice-preprocessing.module';
import { OcrManagerService } from './ocr-manager.service';

@Module({
  imports: [OcrModule, InvoicePreprocessingModule],
  providers: [OcrManagerService],
  exports: [OcrManagerService],
})
export class OcrManagerModule {}