import { Injectable } from '@nestjs/common';
import type { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import type { OcrResultDto } from '../ocr/dto/ocr-result.dto';

export interface SourceTextSelectionResult {
  textExtractionResult: PdfTextExtractionResultDto | null;
  ocrResult: OcrResultDto | null;
  selectedSource: 'native-text-extraction' | 'ocr' | 'image-ocr' | 'none';
}

@Injectable()
export class SourceTextSelectionService {
  select(
    textExtractionResult: PdfTextExtractionResultDto | null,
    ocrResult: OcrResultDto | null,
  ): SourceTextSelectionResult {
    const nativeText = textExtractionResult?.fullText?.trim() ?? '';
    const ocrText = ocrResult?.fullText?.trim() ?? '';

    if (nativeText.length > 0) {
      return {
        textExtractionResult,
        ocrResult,
        selectedSource: 'native-text-extraction',
      };
    }

    if (ocrText.length > 0) {
      return {
        textExtractionResult: null,
        ocrResult,
        selectedSource: ocrResult?.extractionMethod ?? 'ocr',
      };
    }

    return {
      textExtractionResult,
      ocrResult,
      selectedSource: 'none',
    };
  }
}
