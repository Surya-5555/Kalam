import { Module } from '@nestjs/common';
import { RobustnessModule } from '../robustness/robustness.module';
import { InvoiceFraudDetectionService } from './invoice-fraud-detection.service';

@Module({
  imports: [RobustnessModule],
  providers: [InvoiceFraudDetectionService],
  exports: [InvoiceFraudDetectionService],
})
export class InvoiceFraudDetectionModule {}