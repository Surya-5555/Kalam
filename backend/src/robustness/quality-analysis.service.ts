import { Injectable } from '@nestjs/common';
import type { BusinessValidationResult } from '../business-validation/types';
import type { DuplicateDetectionResult } from '../duplicate-detection/dto/duplicate-detection-result.dto';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import type { PipelineWarning } from '../common/pipeline-warning';
import type { QualityAnalysisResult } from './dto/quality-analysis.dto';

@Injectable()
export class QualityAnalysisService {
  analyze(params: {
    invoice: NormalizedInvoice | null;
    validation: BusinessValidationResult | null;
    warnings: PipelineWarning[];
    ocrResult: OcrResultDto | null;
    duplicateDetection: DuplicateDetectionResult | null;
    tableCompletenessScore: number;
    fakeFlags: string[];
  }): QualityAnalysisResult {
    const {
      invoice,
      validation,
      warnings,
      ocrResult,
      duplicateDetection,
      tableCompletenessScore,
      fakeFlags,
    } = params;

    if (!invoice) {
      return {
        score: 0,
        status: 'failed',
        reasons: ['No invoice payload is available.'],
        missingRequiredFields: ['invoice'],
        validationErrorCount: validation?.errors.length ?? 0,
        validationWarningCount: validation?.warnings.length ?? 0,
        tableCompletenessScore: 0,
        ocrConfidence: ocrResult?.averageConfidence ?? null,
      };
    }

    let score = 100;
    const reasons: string[] = [];
    const missingRequiredFields: string[] = [];

    const requiredFields: Array<[string, unknown]> = [
      ['supplier.name', invoice.supplier.name],
      ['invoice.number', invoice.invoice.number],
      ['invoice.date', invoice.invoice.date.normalized],
      ['totals.grandTotal', invoice.totals.grandTotal],
    ];

    for (const [field, value] of requiredFields) {
      if (value == null || value === '') {
        missingRequiredFields.push(field);
      }
    }

    if (missingRequiredFields.length > 0) {
      score -= missingRequiredFields.length * 8;
      reasons.push(`Missing required fields: ${missingRequiredFields.join(', ')}`);
    }

    if (invoice.items.length === 0) {
      score -= 20;
      reasons.push('No line items were extracted.');
    }

    if (tableCompletenessScore < 0.6) {
      score -= Math.round((0.6 - tableCompletenessScore) * 40);
      reasons.push(`Table completeness is low (${Math.round(tableCompletenessScore * 100)}%).`);
    }

    if (validation) {
      score -= validation.errors.length * 12;
      score -= validation.warnings.length * 4;
      if (validation.errors.length > 0) {
        reasons.push(`${validation.errors.length} validation error(s) detected.`);
      }
    }

    if (ocrResult) {
      if (ocrResult.averageConfidence < 45) {
        score -= 20;
        reasons.push(`OCR confidence is low (${ocrResult.averageConfidence.toFixed(1)}%).`);
      } else if (ocrResult.averageConfidence < 65) {
        score -= 10;
        reasons.push(`OCR confidence is moderate (${ocrResult.averageConfidence.toFixed(1)}%).`);
      }
    }

    if (duplicateDetection?.status === 'exact_duplicate') {
      score -= 20;
      reasons.push('Exact duplicate invoice detected.');
    } else if (duplicateDetection?.status === 'possible_duplicate') {
      score -= 10;
      reasons.push('Possible duplicate invoice detected.');
    }

    if (fakeFlags.length > 0) {
      score -= fakeFlags.length * 6;
      reasons.push(`Fraud-rule flags triggered: ${fakeFlags.join(', ')}`);
    }

    score -= warnings.filter((warning) => warning.code !== 'DUPLICATE_POSSIBLE').length;
    score = Math.max(0, Math.min(100, score));

    const status =
      score >= 85
        ? 'complete'
        : score >= 65
          ? 'partial'
          : score >= 40
            ? 'needs_review'
            : 'failed';

    return {
      score,
      status,
      reasons,
      missingRequiredFields,
      validationErrorCount: validation?.errors.length ?? 0,
      validationWarningCount: validation?.warnings.length ?? 0,
      tableCompletenessScore,
      ocrConfidence: ocrResult?.averageConfidence ?? null,
    };
  }
}