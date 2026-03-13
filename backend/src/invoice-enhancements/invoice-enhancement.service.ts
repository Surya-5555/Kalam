import { Inject, Injectable } from '@nestjs/common';
import {
  INVOICE_PIPELINE_ENHANCEMENT_PLUGINS,
  type InvoicePipelineEnhancementPlugin,
} from './interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from './types/pipeline-enhancement-context.type';

@Injectable()
export class InvoiceEnhancementService {
  constructor(
    @Inject(INVOICE_PIPELINE_ENHANCEMENT_PLUGINS)
    private readonly plugins: InvoicePipelineEnhancementPlugin[],
  ) {}

  isEnabled(): boolean {
    return process.env.INVOICE_ENHANCEMENTS_ENABLED !== 'false';
  }

  async beforeDocumentType(context: PipelineEnhancementContext): Promise<void> {
    if (!this.isEnabled()) return;
    for (const plugin of this.plugins) {
      await plugin.beforeDocumentType?.(context);
    }
  }

  async resolveOcr(context: PipelineEnhancementContext): Promise<void> {
    if (!this.isEnabled()) return;
    for (const plugin of this.plugins) {
      await plugin.resolveOcr?.(context);
    }
  }

  async beforeAiExtraction(context: PipelineEnhancementContext): Promise<void> {
    if (!this.isEnabled()) return;
    for (const plugin of this.plugins) {
      await plugin.beforeAiExtraction?.(context);
    }
  }

  async afterAiExtraction(context: PipelineEnhancementContext): Promise<void> {
    if (!this.isEnabled()) return;
    for (const plugin of this.plugins) {
      await plugin.afterAiExtraction?.(context);
    }
  }

  async afterDuplicateDetection(context: PipelineEnhancementContext): Promise<void> {
    if (!this.isEnabled()) return;
    for (const plugin of this.plugins) {
      await plugin.afterDuplicateDetection?.(context);
    }
  }
}
