import { Injectable } from '@nestjs/common';
import type { InvoicePipelineEnhancementPlugin } from '../interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';
import { PdfFallbackExtractionService } from '../../pdf-fallback-extraction/pdf-fallback-extraction.service';

@Injectable()
export class PdfFallbackEnhancementPlugin
  implements InvoicePipelineEnhancementPlugin
{
  readonly name = 'pdf-fallback-enhancement';

  constructor(
    private readonly pdfFallbackExtractionService: PdfFallbackExtractionService,
  ) {}

  async beforeAiExtraction(
    context: PipelineEnhancementContext,
  ): Promise<void> {
    if (context.inspectionResult.fileType !== 'pdf') return;

    const currentText = context.textExtractionResult?.fullText?.trim() ?? '';
    if (currentText.length > 0) return;

    const fallback = await this.pdfFallbackExtractionService.extract(
      context.fileBuffer,
    );
    if (!fallback || fallback.fullText.trim().length === 0) return;

    context.textExtractionResult = fallback;
    context.metadata.pdfFallback = {
      extractionMethod: 'pdftotext',
      extractedCharacterCount: fallback.extractedCharacterCount,
      pageCount: fallback.totalPages,
    };
    context.warnings.push({
      code: 'OCR_FALLBACK_USED',
      message:
        'Native PDF extraction returned no text; used pdftotext fallback extraction.',
      details: `characters=${fallback.extractedCharacterCount}`,
    });
  }
}
