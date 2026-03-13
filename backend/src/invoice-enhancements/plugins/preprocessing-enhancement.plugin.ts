import { Injectable } from '@nestjs/common';
import { InvoicePreprocessingService } from '../../invoice-preprocessing/invoice-preprocessing.service';
import type { InvoicePipelineEnhancementPlugin } from '../interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';

@Injectable()
export class PreprocessingEnhancementPlugin implements InvoicePipelineEnhancementPlugin {
  readonly name = 'preprocessing-enhancement';

  constructor(
    private readonly invoicePreprocessingService: InvoicePreprocessingService,
  ) {}

  async beforeDocumentType(context: PipelineEnhancementContext): Promise<void> {
    const { fileType } = context.inspectionResult;
    if (fileType !== 'jpeg' && fileType !== 'png') return;

    const prepared = await this.invoicePreprocessingService.enhanceImage(
      context.fileBuffer,
      1,
    );

    context.workingBuffer = prepared.buffer;
    context.metadata.preprocessing = {
      blurScore: prepared.blurScore,
      isBlurry: prepared.isBlurry,
      orientationDegrees: prepared.orientationDegrees,
      deskewAngle: prepared.deskewAngle,
      preprocessingApplied: prepared.preprocessingApplied,
      notes: prepared.notes,
    };
  }
}