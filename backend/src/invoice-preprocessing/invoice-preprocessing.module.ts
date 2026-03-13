import { Module } from '@nestjs/common';
import { RobustnessModule } from '../robustness/robustness.module';
import { InvoicePreprocessingService } from './invoice-preprocessing.service';

@Module({
  imports: [RobustnessModule],
  providers: [InvoicePreprocessingService],
  exports: [InvoicePreprocessingService],
})
export class InvoicePreprocessingModule {}