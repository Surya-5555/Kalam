import { Injectable } from '@nestjs/common';
import type { InvoicePipelineEnhancementPlugin } from '../interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';
import { SourceTextSelectionService } from '../source-text-selection.service';

@Injectable()
export class SourceTextSelectionEnhancementPlugin
  implements InvoicePipelineEnhancementPlugin
{
  readonly name = 'source-text-selection-enhancement';

  constructor(
    private readonly sourceTextSelectionService: SourceTextSelectionService,
  ) {}

  async beforeAiExtraction(
    context: PipelineEnhancementContext,
  ): Promise<void> {
    const selection = this.sourceTextSelectionService.select(
      context.textExtractionResult,
      context.ocrResult,
    );

    context.textExtractionResult = selection.textExtractionResult;
    context.ocrResult = selection.ocrResult;
  }
}
