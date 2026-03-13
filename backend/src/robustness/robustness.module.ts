import { Module } from '@nestjs/common';
import { ImagePreprocessingService } from './image-preprocessing.service';
import { TableReconstructionService } from './table-reconstruction.service';
import { MathematicalValidationService } from './mathematical-validation.service';
import { FakeInvoiceDetectionService } from './fake-invoice-detection.service';
import { QualityAnalysisService } from './quality-analysis.service';

@Module({
  providers: [
    ImagePreprocessingService,
    TableReconstructionService,
    MathematicalValidationService,
    FakeInvoiceDetectionService,
    QualityAnalysisService,
  ],
  exports: [
    ImagePreprocessingService,
    TableReconstructionService,
    MathematicalValidationService,
    FakeInvoiceDetectionService,
    QualityAnalysisService,
  ],
})
export class RobustnessModule {}