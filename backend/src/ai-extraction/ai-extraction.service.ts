import { Injectable, Logger, Inject } from '@nestjs/common';
import type { LlmProvider } from './interfaces/llm-provider.interface';
import { LLM_PROVIDER } from './interfaces/llm-provider.interface';
import {
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from './prompt/invoice-extraction.prompt';
import { parseExtractionResponse } from './parser/extraction-parser';
import { validateAndRepair } from './schema/invoice-schema.validator';
import { AiExtractionResultDto } from './dto/ai-extraction-result.dto';
import { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { NormalizationService } from '../normalization/normalization.service';
import { BusinessValidationService } from '../business-validation/business-validation.service';

@Injectable()
export class AiExtractionService {
  private readonly logger = new Logger(AiExtractionService.name);

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
    this.logger.log(
      `Starting AI extraction via ${model}: ` +
        `${sourceText.length} chars, source=${sourceMethod}`,
    );

    try {
      const userPrompt = buildExtractionUserPrompt(sourceText);

      const rawResponse = await this.llmProvider.complete(
        INVOICE_EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        { maxTokens: 4096, temperature: 0 },
      );

      const { invoice, overallConfidence, warnings } =
        parseExtractionResponse(rawResponse);

      // Run the canonical schema validator / repairer
      const { canonical, isValid, repairs, warnings: schemaWarnings } =
        validateAndRepair(invoice);

      const normalizedInvoice = canonical
        ? this.normalizationService.normalize(canonical)
        : null;

      const businessValidation = normalizedInvoice
        ? this.businessValidationService.validate(normalizedInvoice)
        : null;

      const allWarnings = [...warnings, ...schemaWarnings];

      if (allWarnings.length > 0) {
        this.logger.warn(`AI extraction warnings: ${allWarnings.join('; ')}`);
      }

      this.logger.log(
        `AI extraction complete via ${model}: ` +
          `confidence=${overallConfidence.toFixed(2)}, ` +
          `items=${invoice.lineItems.length}, ` +
          `schemaValid=${isValid}, ` +
          `warnings=${allWarnings.length}`,
      );

      const status: AiExtractionResultDto['status'] =
        allWarnings.length > 0 ? 'partial' : 'success';

      return {
        status,
        extractedInvoice: invoice,
        canonicalInvoice: canonical,
        schemaRepairs: repairs,
        normalizedInvoice,
        businessValidation,
        overallConfidence,
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
      this.logger.error(`AI extraction failed: ${message}`);
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
      overallConfidence: 0,
      warnings: [],
      extractionModel: this.llmProvider.getModelName(),
      extractionTimestamp: new Date().toISOString(),
      sourceTextMethod: sourceMethod,
      sourceTextLength,
      extractionError: error,
    };
  }
}
