import { Injectable, Inject } from '@nestjs/common';
import type { LlmProvider } from './interfaces/llm-provider.interface';
import { LLM_PROVIDER } from './interfaces/llm-provider.interface';
import { PipelineLogger } from '../common/pipeline-logger';
import {
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from './prompt/invoice-extraction.prompt';
import { parseExtractionResponse } from './parser/extraction-parser';
import {
  computeRecoveredOverallConfidence,
  extractInvoiceFromOcrText,
  filterRecoveredStructureWarnings,
  mergeRecoveredInvoice,
} from './heuristics/ocr-fallback';
import { validateAndRepair } from './schema/invoice-schema.validator';
import { AiExtractionResultDto } from './dto/ai-extraction-result.dto';
import { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { NormalizationService } from '../normalization/normalization.service';
import { BusinessValidationService } from '../business-validation/business-validation.service';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type { PipelineWarning } from '../common/pipeline-warning';

@Injectable()
export class AiExtractionService {
  private readonly pipelineLogger = new PipelineLogger(AiExtractionService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly normalizationService: NormalizationService,
    private readonly businessValidationService: BusinessValidationService,
  ) {}

  /**
   * Runs AI extraction against whichever text source is available.
   *
   * Source selection priority:
   *  1. Native PDF text extraction (highest fidelity)
   *  2. OCR text (fallback for scanned PDFs and images)
   *
   * This method never throws — a failed LLM call or parse error is caught and
   * returned as a { status: 'failed' } result so the upload pipeline can still
   * succeed even when the AI provider is unavailable.
   */
  async extract(
    textResult: PdfTextExtractionResultDto | null,
    ocrResult: OcrResultDto | null,
  ): Promise<AiExtractionResultDto> {
    // Select best text source and record which stage produced it
    const sourceText = textResult?.fullText ?? ocrResult?.fullText ?? null;
    const sourceMethod: AiExtractionResultDto['sourceTextMethod'] =
      textResult
        ? textResult.extractionMethod
        : (ocrResult?.extractionMethod ?? 'native-text-extraction');

    if (!sourceText || sourceText.trim().length === 0) {
      return this.buildFailedResult(
        'No extracted text was available for AI processing.',
        sourceMethod,
        0,
      );
    }

    const model = this.llmProvider.getModelName();
    this.pipelineLogger.event('ai_extraction.start', {
      model,
      sourceMethod,
      sourceChars: sourceText.length,
    });

    try {
      const userPrompt = buildExtractionUserPrompt(sourceText);

      const rawResponse = await this.llmProvider.complete(
        INVOICE_EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        { maxTokens: 4096, temperature: 0 },
      );

      const { invoice, overallConfidence, warnings } =
        parseExtractionResponse(rawResponse);

      const recoveredFromOcr = extractInvoiceFromOcrText(sourceText);
      const mergedInvoice = mergeRecoveredInvoice(invoice, recoveredFromOcr);
      const mergedOverallConfidence = computeRecoveredOverallConfidence(
        mergedInvoice,
      );
      const filteredWarnings = filterRecoveredStructureWarnings(
        warnings,
        mergedInvoice,
      );

      // Run the canonical schema validator / repairer
      const { canonical, isValid, repairs, warnings: schemaWarnings } =
        validateAndRepair(mergedInvoice);

      const normalizedInvoice = canonical
        ? this.normalizationService.normalize(canonical)
        : null;

      const businessValidation = normalizedInvoice
        ? this.businessValidationService.validate(normalizedInvoice)
        : null;

      const allWarnings: PipelineWarning[] = this.buildPipelineWarnings(
        filteredWarnings,
        schemaWarnings,
        ocrResult,
        normalizedInvoice,
        mergedOverallConfidence,
      );

      if (allWarnings.length > 0) {
        this.pipelineLogger.warn('ai_extraction.warnings', {
          count: allWarnings.length,
          codes: allWarnings.map((w) => w.code),
        });
      }

      this.pipelineLogger.event('ai_extraction.complete', {
        model,
        confidence: parseFloat(mergedOverallConfidence.toFixed(3)),
        itemCount: mergedInvoice.lineItems.length,
        schemaValid: isValid,
        repairCount: repairs.length,
        warningCount: allWarnings.length,
      });

      const status: AiExtractionResultDto['status'] =
        allWarnings.length > 0 ? 'partial' : 'success';

      return {
        status,
        extractedInvoice: mergedInvoice,
        canonicalInvoice: canonical,
        schemaRepairs: repairs,
        normalizedInvoice,
        businessValidation,
        duplicateDetection: null,
        overallConfidence: mergedOverallConfidence,
        warnings: allWarnings,
        extractionModel: model,
        extractionTimestamp: new Date().toISOString(),
        sourceTextMethod: sourceMethod,
        sourceTextLength: sourceText.length,
        extractionError: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.pipelineLogger.error('ai_extraction.failed', { model, sourceMethod, reason: message });
      return this.buildFailedResult(message, sourceMethod, sourceText.length);
    }
  }

  private buildFailedResult(
    error: string,
    sourceMethod: AiExtractionResultDto['sourceTextMethod'],
    sourceTextLength: number,
  ): AiExtractionResultDto {
    return {
      status: 'failed',
      extractedInvoice: null,
      canonicalInvoice: null,
      schemaRepairs: [],
      normalizedInvoice: null,
      businessValidation: null,
      duplicateDetection: null,
      overallConfidence: 0,
      warnings: [],
      extractionModel: this.llmProvider.getModelName(),
      extractionTimestamp: new Date().toISOString(),
      sourceTextMethod: sourceMethod,
      sourceTextLength,
      extractionError: error,
    };
  }

  /**
   * Collect all non-fatal pipeline warnings from OCR quality, AI parse output,
   * schema repairs, and normalized invoice fields.
   */
  private buildPipelineWarnings(
    aiParseWarnings: string[],
    schemaWarnings: string[],
    ocrResult: OcrResultDto | null,
    normalizedInvoice: NormalizedInvoice | null,
    overallConfidence: number,
  ): PipelineWarning[] {
    const result: PipelineWarning[] = [];

    // ── OCR quality ───────────────────────────────────────────────────────────
    if (ocrResult?.hadLowConfidence) {
      result.push({
        code: 'OCR_LOW_CONFIDENCE',
        message:
          `OCR confidence was low (avg ${ocrResult.averageConfidence.toFixed(0)}%). ` +
          `Extracted text may contain recognition errors.`,
        details: `averageConfidence=${ocrResult.averageConfidence.toFixed(1)}`,
      });
    }
    if (ocrResult?.hadPartialFailure) {
      result.push({
        code: 'OCR_PARTIAL_FAILURE',
        message: 'One or more pages failed OCR processing and were skipped.',
      });
    }

    // ── AI parse warnings → structured ───────────────────────────────────────
    for (const msg of aiParseWarnings) {
      result.push({ code: 'AI_EXTRACTION_PARTIAL', message: msg });
    }

    // ── Schema repair warnings → structured ──────────────────────────────────
    for (const msg of schemaWarnings) {
      result.push({ code: 'SCHEMA_REPAIR', message: msg });
    }

    // ── Overall confidence ────────────────────────────────────────────────────
    if (overallConfidence > 0 && overallConfidence < 0.6) {
      result.push({
        code: 'LOW_OVERALL_CONFIDENCE',
        message:
          `Overall extraction confidence is low ` +
          `(${Math.round(overallConfidence * 100)}%). Manual review recommended.`,
        details: `confidence=${overallConfidence.toFixed(2)}`,
      });
    }

    if (!normalizedInvoice) return result;

    // ── Invoice completeness ──────────────────────────────────────────────────
    if (!normalizedInvoice.invoice.number) {
      result.push({
        code: 'MISSING_INVOICE_NUMBER',
        message: 'Invoice number could not be extracted from the document.',
        field: 'invoice.number',
      });
    }

    if (!normalizedInvoice.invoice.date?.normalized) {
      result.push({
        code: 'MISSING_INVOICE_DATE',
        message: 'Invoice date could not be extracted or parsed.',
        field: 'invoice.date',
      });
    }

    const supplierCountry = normalizedInvoice.supplier.country?.trim().toUpperCase() ?? null;
    const buyerCountry = normalizedInvoice.buyer.country?.trim().toUpperCase() ?? null;
    const likelyIndianInvoice =
      supplierCountry === 'IN' ||
      supplierCountry === 'INDIA' ||
      buyerCountry === 'IN' ||
      buyerCountry === 'INDIA' ||
      normalizedInvoice.tax.regime === 'GST';

    if (likelyIndianInvoice && normalizedInvoice.supplier.gstin.raw == null) {
      result.push({
        code: 'MISSING_SUPPLIER_GSTIN',
        message: 'Supplier GSTIN is absent from the invoice.',
        field: 'supplier.gstin',
      });
    }

    const pt = normalizedInvoice.invoice.paymentTerms;
    if (pt.raw != null && pt.days == null && pt.normalized == null) {
      result.push({
        code: 'UNCLEAR_PAYMENT_TERMS',
        message: `Payment terms "${pt.raw}" could not be interpreted into a standard day count.`,
        field: 'invoice.paymentTerms',
        details: `raw="${pt.raw}"`,
      });
    }

    // ── Financial integrity ───────────────────────────────────────────────────
    if (normalizedInvoice.totals.grandTotalMismatch) {
      const t = normalizedInvoice.totals;
      result.push({
        code: 'TOTALS_MISMATCH',
        message: 'Grand total does not match the sum of line items.',
        field: 'totals.grandTotal',
        details:
          t.itemsSumTotal != null
            ? `itemsSum=${t.itemsSumTotal}, declared=${t.grandTotal}`
            : undefined,
      });
    }

    const mismatchedItems = normalizedInvoice.items.filter((i) => i.totalMismatch);
    if (mismatchedItems.length > 0) {
      result.push({
        code: 'LINE_ITEM_TOTAL_MISMATCH',
        message: `${mismatchedItems.length} line item(s) have totals that don't match quantity × unit price.`,
        field: 'items',
        details: `affectedCount=${mismatchedItems.length}`,
      });
    }

    return result;
  }
}
