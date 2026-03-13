import { Injectable } from '@nestjs/common';
import { OcrManagerService } from '../../ocr-manager/ocr-manager.service';
import type { InvoicePipelineEnhancementPlugin } from '../interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';

@Injectable()
export class OcrFallbackEnhancementPlugin implements InvoicePipelineEnhancementPlugin {
  readonly name = 'ocr-fallback-enhancement';

  constructor(private readonly ocrManagerService: OcrManagerService) {}

  async resolveOcr(context: PipelineEnhancementContext): Promise<void> {
    const { documentType } = context;
    if (
      documentType !== 'image-document' &&
      documentType !== 'scanned-pdf'
    ) {
      return;
    }

    const ocrResult = await this.ocrManagerService.recognize({
      fileBuffer: context.workingBuffer,
      fileType:
        context.inspectionResult.fileType === 'pdf'
          ? 'pdf'
          : context.inspectionResult.fileType === 'jpeg'
            ? 'jpeg'
            : 'png',
      documentType,
    });

    context.ocrResult = ocrResult;
    context.metadata.ocrFallback = {
      engineUsed: ocrResult.engineUsed ?? 'tesseract',
      enginesTried: ocrResult.enginesTried ?? ['tesseract'],
      fallbackUsed: ocrResult.fallbackUsed ?? false,
    };

    if (ocrResult.fallbackUsed) {
      context.warnings.push({
        code: 'OCR_FALLBACK_USED',
        message: `OCR fallback selected ${ocrResult.engineUsed ?? 'an alternate engine'} after low-confidence primary OCR.`,
        details: `engines=${(ocrResult.enginesTried ?? []).join(',')}`,
      });
    }
  }
}