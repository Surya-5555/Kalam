import { Module } from '@nestjs/common';
import { RobustnessModule } from '../robustness/robustness.module';
import { InvoicePreprocessingModule } from '../invoice-preprocessing/invoice-preprocessing.module';
import { OcrManagerModule } from '../ocr-manager/ocr-manager.module';
import { MultiPageMergeModule } from '../multi-page-merge/multi-page-merge.module';
import { InvoiceMathValidatorModule } from '../invoice-math-validator/invoice-math-validator.module';
import { InvoiceFraudDetectionModule } from '../invoice-fraud-detection/invoice-fraud-detection.module';
import { ExtractionQualityAnalyzerModule } from '../extraction-quality-analyzer/extraction-quality-analyzer.module';
import { BusinessValidationModule } from '../business-validation/business-validation.module';
import { PdfFallbackExtractionModule } from '../pdf-fallback-extraction/pdf-fallback-extraction.module';
import { InvoiceEnhancementService } from './invoice-enhancement.service';
import {
  INVOICE_PIPELINE_ENHANCEMENT_PLUGINS,
} from './interfaces/pipeline-enhancement.interface';
import { PreprocessingEnhancementPlugin } from './plugins/preprocessing-enhancement.plugin';
import { OcrFallbackEnhancementPlugin } from './plugins/ocr-fallback-enhancement.plugin';
import { PostExtractionEnhancementPlugin } from './plugins/post-extraction-enhancement.plugin';
import { SourceTextSelectionService } from './source-text-selection.service';
import { SourceTextSelectionEnhancementPlugin } from './plugins/source-text-selection-enhancement.plugin';
import { PdfFallbackEnhancementPlugin } from './plugins/pdf-fallback-enhancement.plugin';

@Module({
  imports: [
    RobustnessModule,
    InvoicePreprocessingModule,
    OcrManagerModule,
    MultiPageMergeModule,
    InvoiceMathValidatorModule,
    InvoiceFraudDetectionModule,
    ExtractionQualityAnalyzerModule,
    BusinessValidationModule,
    PdfFallbackExtractionModule,
  ],
  providers: [
    SourceTextSelectionService,
    PdfFallbackEnhancementPlugin,
    PreprocessingEnhancementPlugin,
    OcrFallbackEnhancementPlugin,
    SourceTextSelectionEnhancementPlugin,
    PostExtractionEnhancementPlugin,
    {
      provide: INVOICE_PIPELINE_ENHANCEMENT_PLUGINS,
      useFactory: (
        pdfFallbackPlugin: PdfFallbackEnhancementPlugin,
        sourceTextSelectionPlugin: SourceTextSelectionEnhancementPlugin,
        preprocessingPlugin: PreprocessingEnhancementPlugin,
        ocrFallbackPlugin: OcrFallbackEnhancementPlugin,
        postExtractionPlugin: PostExtractionEnhancementPlugin,
      ) => [
        pdfFallbackPlugin,
        sourceTextSelectionPlugin,
        preprocessingPlugin,
        ocrFallbackPlugin,
        postExtractionPlugin,
      ],
      inject: [
        PdfFallbackEnhancementPlugin,
        SourceTextSelectionEnhancementPlugin,
        PreprocessingEnhancementPlugin,
        OcrFallbackEnhancementPlugin,
        PostExtractionEnhancementPlugin,
      ],
    },
    InvoiceEnhancementService,
  ],
  exports: [InvoiceEnhancementService],
})
export class InvoiceEnhancementsModule {}
