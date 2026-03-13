import { Injectable } from '@nestjs/common';
import { BusinessValidationService } from '../../business-validation/business-validation.service';
import { TableReconstructionService } from '../../robustness/table-reconstruction.service';
import { MultiPageMergeService } from '../../multi-page-merge/multi-page-merge.service';
import { InvoiceMathValidatorService } from '../../invoice-math-validator/invoice-math-validator.service';
import { InvoiceFraudDetectionService } from '../../invoice-fraud-detection/invoice-fraud-detection.service';
import { ExtractionQualityAnalyzerService } from '../../extraction-quality-analyzer/extraction-quality-analyzer.service';
import type {
  BusinessValidationResult,
  ValidationIssue,
} from '../../business-validation/types';
import type { InvoicePipelineEnhancementPlugin } from '../interfaces/pipeline-enhancement.interface';
import type { PipelineEnhancementContext } from '../types/pipeline-enhancement-context.type';

@Injectable()
export class PostExtractionEnhancementPlugin implements InvoicePipelineEnhancementPlugin {
  readonly name = 'post-extraction-enhancement';

  constructor(
    private readonly tableReconstructionService: TableReconstructionService,
    private readonly multiPageMergeService: MultiPageMergeService,
    private readonly invoiceMathValidatorService: InvoiceMathValidatorService,
    private readonly invoiceFraudDetectionService: InvoiceFraudDetectionService,
    private readonly extractionQualityAnalyzerService: ExtractionQualityAnalyzerService,
    private readonly businessValidationService: BusinessValidationService,
  ) {}

  async afterAiExtraction(context: PipelineEnhancementContext): Promise<void> {
    const aiResult = context.aiResult;
    if (!aiResult || !aiResult.normalizedInvoice) return;

    const merge = this.multiPageMergeService.merge(
      context.textExtractionResult,
      context.ocrResult,
    );
    const reconstruction = this.tableReconstructionService.reconstruct(
      aiResult.normalizedInvoice,
      context.textExtractionResult,
      context.ocrResult,
    );

    const mathValidation = this.invoiceMathValidatorService.validate(
      reconstruction.invoice,
    );
    const fraudDetection = this.invoiceFraudDetectionService.detect(
      reconstruction.invoice,
    );

    aiResult.normalizedInvoice = reconstruction.invoice;
    aiResult.businessValidation = this.mergeValidations(
      this.businessValidationService.validate(reconstruction.invoice),
      mathValidation.issues,
      fraudDetection.issues,
    );

    context.warnings.push(...reconstruction.warnings);
    context.warnings.push(...mathValidation.warnings);
    context.warnings.push(...fraudDetection.warnings);

    context.metadata.multiPage = {
      pageCount: merge.pageCount,
      totalsPageNumber: merge.totalsPageNumber,
      itemPageNumbers: merge.itemPageNumbers,
    };
    context.metadata.tableReconstruction = {
      reconstructed: reconstruction.reconstructed,
      recoveredItemCount: reconstruction.recoveredItemCount,
      source: reconstruction.source,
      mergedPages: reconstruction.mergedPages,
      completenessScore: reconstruction.completenessScore,
    };
    context.metadata.mathValidation = {
      issueCount: mathValidation.issues.length,
    };
    context.metadata.fraudDetection = {
      flags: fraudDetection.flags,
      issueCount: fraudDetection.issues.length,
    };
  }

  async afterDuplicateDetection(context: PipelineEnhancementContext): Promise<void> {
    const aiResult = context.aiResult;
    if (!aiResult || !aiResult.normalizedInvoice) return;

    const quality = this.extractionQualityAnalyzerService.analyze({
      invoice: aiResult.normalizedInvoice,
      validation: aiResult.businessValidation,
      warnings: context.warnings,
      ocrResult: context.ocrResult,
      duplicateDetection: context.duplicateDetection,
      tableCompletenessScore:
        context.metadata.tableReconstruction?.completenessScore ?? 0,
      fakeFlags: context.metadata.fraudDetection?.flags ?? [],
    });

    context.metadata.qualityAnalysis = quality;

    if (quality.status === 'needs_review' || quality.status === 'failed') {
      context.warnings.push({
        code: 'QUALITY_REVIEW_REQUIRED',
        message: `Extraction quality status is ${quality.status}.`,
        details: `score=${quality.score}`,
      });
    }
  }

  private mergeValidations(
    base: BusinessValidationResult,
    ...issueGroups: ValidationIssue[][]
  ): BusinessValidationResult {
    const additionalIssues = issueGroups.flat();
    const allIssues = [...base.allIssues, ...additionalIssues];
    const errors = allIssues.filter((issue) => issue.severity === 'error');
    const warnings = allIssues.filter((issue) => issue.severity === 'warning');

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      allIssues,
      rulesRun: base.rulesRun + issueGroups.length,
      rulesPassed: base.rulesPassed,
    };
  }
}