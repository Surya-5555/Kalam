import { Injectable } from '@nestjs/common';
import { MathematicalValidationService } from '../robustness/mathematical-validation.service';

@Injectable()
export class InvoiceMathValidatorService {
  constructor(
    private readonly mathematicalValidationService: MathematicalValidationService,
  ) {}

  validate(...args: Parameters<MathematicalValidationService['validate']>) {
    return this.mathematicalValidationService.validate(...args);
  }
}