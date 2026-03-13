import { Module } from '@nestjs/common';
import { InvoicePreprocessingModule } from '../invoice-preprocessing/invoice-preprocessing.module';
import { InvoiceOrientationService } from './invoice-orientation.service';

@Module({
  imports: [InvoicePreprocessingModule],
  providers: [InvoiceOrientationService],
  exports: [InvoiceOrientationService],
})
export class InvoiceOrientationModule {}