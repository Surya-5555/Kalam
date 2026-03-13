import { Injectable } from '@nestjs/common';
import type { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import type { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import type {
  NormalizedInvoice,
  NormalizedLineItem,
} from '../normalization/dto/normalized-invoice.dto';
import type { PipelineWarning } from '../common/pipeline-warning';

export interface TableReconstructionResult {
  invoice: NormalizedInvoice;
  warnings: PipelineWarning[];
  reconstructed: boolean;
  recoveredItemCount: number;
  source: 'native-text' | 'ocr' | 'existing';
  mergedPages: number;
  completenessScore: number;
}

interface ParsedRow {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
}

@Injectable()
export class TableReconstructionService {
  reconstruct(
    invoice: NormalizedInvoice,
    textResult: PdfTextExtractionResultDto | null,
    ocrResult: OcrResultDto | null,
  ): TableReconstructionResult {
    const sourcePages = textResult?.pages?.length
      ? textResult.pages.map((page) => page.text)
      : (ocrResult?.pages?.map((page) => page.text) ?? []);

    const parsedRows = this.parseRowsAcrossPages(sourcePages);
    const existingCompleteness = this.computeCompleteness(invoice.items);
    const reconstructedItems = parsedRows.map((row, index) =>
      this.buildLineItem(row, index + 1),
    );
    const reconstructedCompleteness = this.computeCompleteness(reconstructedItems);

    const shouldReplace =
      reconstructedItems.length > 0 &&
      (invoice.items.length === 0 || reconstructedCompleteness > existingCompleteness + 0.15);

    const warnings: PipelineWarning[] = [];
    let nextInvoice = invoice;
    let reconstructed = false;
    let source: TableReconstructionResult['source'] = 'existing';

    if (shouldReplace) {
      nextInvoice = {
        ...invoice,
        items: reconstructedItems,
      };
      reconstructed = true;
      source = textResult?.pages?.length ? 'native-text' : 'ocr';
      warnings.push({
        code: 'TABLE_RECONSTRUCTED',
        message: `Line-item table was reconstructed from ${source === 'native-text' ? 'PDF text' : 'OCR'} pages.`,
        field: 'items',
        details: `recoveredItems=${reconstructedItems.length}`,
      });
    }

    if (nextInvoice.items.length === 0) {
      warnings.push({
        code: 'MISSING_LINE_ITEMS',
        message: 'No reliable line items could be reconstructed from the invoice table.',
        field: 'items',
      });
    }

    return {
      invoice: nextInvoice,
      warnings,
      reconstructed,
      recoveredItemCount: reconstructedItems.length,
      source,
      mergedPages: sourcePages.length,
      completenessScore: shouldReplace
        ? reconstructedCompleteness
        : existingCompleteness,
    };
  }

  private parseRowsAcrossPages(pages: string[]): ParsedRow[] {
    const rows: ParsedRow[] = [];
    let pendingDescription: string[] = [];
    let inTable = false;

    for (const page of pages) {
      const lines = page
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      for (const line of lines) {
        if (this.isHeader(line)) {
          inTable = true;
          pendingDescription = [];
          continue;
        }

        if (!inTable) continue;
        if (this.isFooter(line)) {
          inTable = false;
          pendingDescription = [];
          continue;
        }

        const parsed = this.tryParseRow(line, pendingDescription);
        if (parsed) {
          rows.push(parsed);
          pendingDescription = [];
          continue;
        }

        if (/[A-Za-z]/.test(line)) {
          pendingDescription.push(line);
        }
      }
    }

    return rows;
  }

  private isHeader(line: string): boolean {
    return (
      /(description|item)/i.test(line) &&
      /(qty|quantity)/i.test(line) &&
      /(amount|total|rate|price)/i.test(line)
    );
  }

  private isFooter(line: string): boolean {
    return /^(subtotal|tax|cgst|sgst|igst|grand total|amount due|total\s*(?:inr|amount)?)/i.test(line);
  }

  private tryParseRow(
    line: string,
    pendingDescription: string[],
  ): ParsedRow | null {
    const normalized = line.replace(/[₹,$]/g, '').trim();
    const amountMatches = [...normalized.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g)].map(
      (match) => match[0],
    );

    if (amountMatches.length < 2) {
      return null;
    }

    const totalRaw = amountMatches[amountMatches.length - 1] ?? null;
    const unitPriceRaw = amountMatches[amountMatches.length - 2] ?? null;
    const quantityRaw = amountMatches[0] ?? null;
    const taxRateRaw = amountMatches.find((value) => value.endsWith('%')) ?? null;

    const firstNumericIndex = normalized.search(/-?\d/);
    if (firstNumericIndex < 0) {
      return null;
    }

    const inlineDescription =
      firstNumericIndex === 0 ? '' : normalized.slice(0, firstNumericIndex).trim();

    const descriptionSegments = [...pendingDescription, inlineDescription]
      .filter(Boolean);
    const description = descriptionSegments.join(' ').trim();
    if (!description) {
      return null;
    }

    const taxAmountRaw = amountMatches.length >= 3 ? amountMatches[amountMatches.length - 2] : null;

    return {
      description,
      quantity: this.parseNumber(quantityRaw),
      unitPrice: this.parseNumber(unitPriceRaw),
      taxRate: this.parseNumber(taxRateRaw?.replace('%', '') ?? null),
      taxAmount: amountMatches.length >= 4 ? this.parseNumber(taxAmountRaw) : null,
      total: this.parseNumber(totalRaw),
    };
  }

  private buildLineItem(row: ParsedRow, lineNumber: number): NormalizedLineItem {
    const quantity = row.quantity;
    const unitPrice = row.unitPrice;
    const computedTotal =
      quantity != null && unitPrice != null ? Math.round(quantity * unitPrice * 100) / 100 : null;
    const totalMismatch =
      computedTotal != null && row.total != null
        ? Math.abs(computedTotal - row.total) > 0.01
        : false;

    return {
      lineNumber,
      description: row.description,
      quantity,
      unit: null,
      unitPrice,
      discount: null,
      discountType: null,
      subtotal: computedTotal,
      taxRate: row.taxRate,
      taxAmount: row.taxAmount,
      total: row.total,
      computedTotal,
      totalMismatch,
      confidence: 0.72,
    };
  }

  private computeCompleteness(items: NormalizedLineItem[]): number {
    if (items.length === 0) return 0;
    let populatedFields = 0;
    const totalFields = items.length * 4;

    for (const item of items) {
      if (item.description) populatedFields++;
      if (item.quantity != null) populatedFields++;
      if (item.unitPrice != null) populatedFields++;
      if (item.total != null) populatedFields++;
    }

    return populatedFields / totalFields;
  }

  private parseNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
}