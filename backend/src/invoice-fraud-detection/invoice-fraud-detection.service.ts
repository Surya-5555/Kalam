import { Injectable } from '@nestjs/common';
import { FakeInvoiceDetectionService } from '../robustness/fake-invoice-detection.service';

@Injectable()
export class InvoiceFraudDetectionService {
  constructor(
    private readonly fakeInvoiceDetectionService: FakeInvoiceDetectionService,
  ) {}

  detect(...args: Parameters<FakeInvoiceDetectionService['detect']>) {
    return this.fakeInvoiceDetectionService.detect(...args);
  }
}