import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';

export interface InvoicePipelineEnhancementPlugin {
  readonly name: string;
  beforeDocumentType?(context: PipelineEnhancementContext): Promise<void>;
  resolveOcr?(context: PipelineEnhancementContext): Promise<void>;
  beforeAiExtraction?(context: PipelineEnhancementContext): Promise<void>;
  afterAiExtraction?(context: PipelineEnhancementContext): Promise<void>;
  afterDuplicateDetection?(context: PipelineEnhancementContext): Promise<void>;
}

export const INVOICE_PIPELINE_ENHANCEMENT_PLUGINS =
  'INVOICE_PIPELINE_ENHANCEMENT_PLUGINS';
