import { Injectable } from '@nestjs/common';
import type { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import type { OcrResultDto } from '../ocr/dto/ocr-result.dto';

export interface MultiPageMergeResult {
  mergedText: string;
  pageCount: number;
  totalsPageNumber: number | null;
  itemPageNumbers: number[];
}

@Injectable()
export class MultiPageMergeService {
  merge(
    textResult: PdfTextExtractionResultDto | null,
    ocrResult: OcrResultDto | null,
  ): MultiPageMergeResult {
    const pages = textResult?.pages?.length ? textResult.pages : (ocrResult?.pages ?? []);
    const itemPageNumbers: number[] = [];
    let totalsPageNumber: number | null = null;

    for (const page of pages) {
      const text = page.text.toLowerCase();
      if (/(description|item).*(qty|quantity).*(amount|total|rate)/i.test(page.text)) {
        itemPageNumbers.push(page.pageNumber);
      }
      if (/(grand total|total\s*\(?inr\)?|amount due|balance due|subtotal)/.test(text)) {
        totalsPageNumber = page.pageNumber;
      }
    }

    return {
      mergedText: pages.map((page) => page.text).join('\n\n--- Page Break ---\n\n'),
      pageCount: pages.length,
      totalsPageNumber,
      itemPageNumbers,
    };
  }
}