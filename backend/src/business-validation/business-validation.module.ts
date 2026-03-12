import { Module } from '@nestjs/common';
import { BusinessValidationService } from './business-validation.service';

@Module({
  providers: [BusinessValidationService],
  exports:   [BusinessValidationService],
})
export class BusinessValidationModule {}
