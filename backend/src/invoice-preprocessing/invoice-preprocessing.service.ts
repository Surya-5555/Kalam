import { Injectable } from '@nestjs/common';
import { ImagePreprocessingService } from '../robustness/image-preprocessing.service';
import type { PreparedOcrPage } from '../robustness/dto/image-preprocessing.dto';

@Injectable()
export class InvoicePreprocessingService {
  constructor(
    private readonly imagePreprocessingService: ImagePreprocessingService,
  ) {}

  async enhanceImage(
    buffer: Buffer,
    pageNumber: number = 1,
  ): Promise<PreparedOcrPage> {
    return this.imagePreprocessingService.prepareImageForOcr(buffer, pageNumber);
  }
}