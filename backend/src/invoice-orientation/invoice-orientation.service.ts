import { Injectable } from '@nestjs/common';
import { InvoicePreprocessingService } from '../invoice-preprocessing/invoice-preprocessing.service';

export interface OrientationCorrectionResult {
  buffer: Buffer;
  detectedOrientation: 0 | 90 | 180 | 270;
  deskewAngle: number;
  notes: string[];
}

@Injectable()
export class InvoiceOrientationService {
  constructor(
    private readonly invoicePreprocessingService: InvoicePreprocessingService,
  ) {}

  async correctImage(
    buffer: Buffer,
    pageNumber: number = 1,
  ): Promise<OrientationCorrectionResult> {
    const prepared = await this.invoicePreprocessingService.enhanceImage(
      buffer,
      pageNumber,
    );

    return {
      buffer: prepared.buffer,
      detectedOrientation: prepared.orientationDegrees,
      deskewAngle: prepared.deskewAngle,
      notes: prepared.notes,
    };
  }
}