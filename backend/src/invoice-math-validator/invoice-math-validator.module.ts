import { Module } from '@nestjs/common';
import { RobustnessModule } from '../robustness/robustness.module';
import { InvoiceMathValidatorService } from './invoice-math-validator.service';

@Module({
  imports: [RobustnessModule],
  providers: [InvoiceMathValidatorService],
  exports: [InvoiceMathValidatorService],
})
export class InvoiceMathValidatorModule {}