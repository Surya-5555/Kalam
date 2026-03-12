import { Injectable, Logger } from '@nestjs/common';
import { pathToFileURL } from 'url';
import {
  PdfTextExtractionResultDto,
  PageTextDto,
} from './dto/pdf-text-extraction-result.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape of the pdfjs-dist module we actually use. */
interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: { data: Uint8Array; standardFontDataUrl?: string }): { promise: Promise<PdfjsDocument> };
}

interface PdfjsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPage>;
  destroy(): Promise<void>;
}

interface PdfjsPage {
  getTextContent(opts?: { includeMarkedContent?: boolean }): Promise<PdfjsTextContent>;
}

interface PdfjsTextContent {
  items: Array<PdfjsTextItem | PdfjsMarkedContent>;
}

interface PdfjsTextItem {
  str: string;
  hasEOL: boolean;
  transform: number[]; // [a, b, c, d, e, f] – e=x, f=y
}

interface PdfjsMarkedContent {
  type: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum printable chars a page needs to be considered non-empty. */
const MIN_PAGE_CHARS = 5;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * PdfTextExtractionService
 *
 * Extracts text from text-based PDFs using pdfjs-dist (Mozilla PDF.js).
 * Returns page-wise and combined text with metadata.
 *
 * This service is intentionally focused on native text extraction only.
 * Scanned PDFs / images are handled by the OCR stage.
 */
@Injectable()
export class PdfTextExtractionService {
  private readonly logger = new Logger(PdfTextExtractionService.name);

  /** Cached pdfjs module reference (loaded on first use via dynamic import). */
  private pdfjsLib: PdfjsLib | null = null;

  /** file:// URL to pdfjs-dist standard font data directory (computed once). */
  private get standardFontDataUrl(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fontsDir: string = require.resolve('pdfjs-dist/standard_fonts/FoxitFixed.pfb')
      .replace(/FoxitFixed\.pfb$/, '');
    const { pathToFileURL } = require('url');
    return pathToFileURL(fontsDir).href;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  async extract(buffer: Buffer): Promise<PdfTextExtractionResultDto> {
    let doc: PdfjsDocument | null = null;

    try {
      const pdfjs = await this.loadPdfjs();

      doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        standardFontDataUrl: this.standardFontDataUrl,
      }).promise;

      const totalPages = doc.numPages;
      const pages: PageTextDto[] = [];
      let hadPartialFailure = false;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          const pageText = await this.extractPageText(page);
          pages.push({ pageNumber: pageNum, text: pageText, characterCount: pageText.length });
        } catch (pageErr: any) {
          this.logger.warn(`Page ${pageNum} extraction failed: ${pageErr?.message}`);
          pages.push({ pageNumber: pageNum, text: '', characterCount: 0 });
          hadPartialFailure = true;
        }
      }

      const fullText = pages
        .map((p) => p.text)
        .filter((t) => t.length >= MIN_PAGE_CHARS)
        .join('\n\n--- Page Break ---\n\n');

      const extractedCharacterCount = pages.reduce((sum, p) => sum + p.characterCount, 0);

      this.logger.log(
        `PDF text extraction complete: ${totalPages} pages, ${extractedCharacterCount} chars`,
      );

      return {
        fullText,
        pages,
        totalPages,
        extractedCharacterCount,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure,
      };
    } catch (err: any) {
      this.logger.error(`PDF text extraction failed: ${err?.message}`);
      return {
        fullText: '',
        pages: [],
        totalPages: 0,
        extractedCharacterCount: 0,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure: true,
      };
    } finally {
      if (doc) {
        await doc.destroy().catch(() => undefined);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Page text extraction
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Extracts and cleans text from a single PDF page.
   *
   * Reconstruction strategy:
   *  1. Filter to real text items (ignore marked-content markers).
   *  2. Group items by their Y position (PDF coordinate: origin at bottom-left).
   *     Items within ±2 units share the same visual line.
   *  3. Sort lines from top to bottom (descending Y), items within a line
   *     left to right (ascending X).
   *  4. Join items in each line with spaces; join lines with newlines.
   *  5. Apply junk-cleaning pass.
   *
   * This approach preserves invoice layout far better than naive item
   * concatenation, since PDF content streams are in drawing order which is
   * not always reading order.
   */
  private async extractPageText(page: PdfjsPage): Promise<string> {
    const content = await page.getTextContent({ includeMarkedContent: false });

    // Separate real text items from marked-content markers
    const textItems = content.items.filter(
      (item): item is PdfjsTextItem =>
        'str' in item && typeof item.str === 'string',
    );

    if (textItems.length === 0) return '';

    // Group items into visual lines by Y coordinate (transform[5])
    // tolerance of ±2 pt covers minor baseline shifts in the same line
    const Y_TOLERANCE = 2;
    const lines: Map<number, PdfjsTextItem[]> = new Map();

    for (const item of textItems) {
      const y = item.transform[5];
      // Find an existing line bucket within tolerance
      let bucketKey: number | null = null;
      for (const key of lines.keys()) {
        if (Math.abs(key - y) <= Y_TOLERANCE) {
          bucketKey = key;
          break;
        }
      }
      if (bucketKey === null) {
        lines.set(y, [item]);
      } else {
        lines.get(bucketKey)!.push(item);
      }
    }

    // Sort lines top→bottom (PDF y-axis: larger = higher on page)
    const sortedLineKeys = [...lines.keys()].sort((a, b) => b - a);

    const lineStrings = sortedLineKeys.map((key) => {
      const lineItems = lines.get(key)!;
      // Sort items left→right within a line (transform[4] is X)
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      // Build line string, respecting hasEOL hints for inline breaks
      let line = '';
      for (const item of lineItems) {
        if (line.length > 0 && item.str.length > 0) {
          // Add a space between adjacent items unless the previous already ends
          // with whitespace or the item starts with punctuation
          const prevChar = line[line.length - 1];
          const nextChar = item.str[0];
          if (prevChar !== ' ' && prevChar !== '\n' && nextChar !== ' ' && nextChar !== ',') {
            line += ' ';
          }
        }
        line += item.str;
        if (item.hasEOL) line += '\n';
      }
      return line.trimEnd();
    });

    // Join lines and clean
    const rawText = lineStrings.join('\n');
    return this.cleanText(rawText);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Text cleaning
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Removes obvious junk while preserving invoice content and layout cues.
   *
   * Rules applied:
   *  - Strip null / replacement characters (\u0000, \uFFFD)
   *  - Collapse runs of 3+ identical non-alphanumeric chars that look like
   *    fill characters (e.g. "------", "......") — keep up to 2
   *  - Collapse horizontal whitespace within each line to a single space
   *  - Trim each line
   *  - Collapse sequences of more than 2 blank lines to exactly 2
   *  - Trim the whole result
   */
  private cleanText(raw: string): string {
    return raw
      // Remove null bytes and replacement chars
      .replace(/[\u0000\uFFFD]/g, '')
      // Collapse runs of identical non-alphanumeric fill chars (e.g. ----, ....)
      .replace(/([^a-zA-Z0-9\s])\1{2,}/g, '$1$1')
      // Collapse multiple horizontal whitespace within lines (not newlines)
      .replace(/[^\S\n]+/g, ' ')
      // Trim each line
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Collapse 3+ consecutive blank lines → 2
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // pdfjs loader (lazy, cached)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Dynamically imports the pdfjs-dist legacy build.
   * Using dynamic import() is required because pdfjs-dist v4+ is ESM-only,
   * and this NestJS project compiles to CommonJS.
   */
  private async loadPdfjs(): Promise<PdfjsLib> {
    if (this.pdfjsLib) return this.pdfjsLib;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – dynamic import of ESM from CJS; no type declaration needed
    const pdfjs: PdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // pdfjs-dist v5 requires a non-empty workerSrc — an empty string is falsy
    // and throws "No GlobalWorkerOptions.workerSrc specified" at render time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workerPath: string = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

    this.pdfjsLib = pdfjs;
    return pdfjs;
  }
}
