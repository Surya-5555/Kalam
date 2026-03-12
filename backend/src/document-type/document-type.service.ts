import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentTypeResultDto,
  DocumentType,
  ExtractionMethod,
} from './dto/document-type-result.dto';
import { InspectionFileType } from '../inspection/dto/inspection-result.dto';

// ─── Thresholds ──────────────────────────────────────────────────────────────

/**
 * Minimum number of printable characters that must be recoverable from
 * uncompressed PDF content streams for the file to be classified as a
 * text-based PDF.  Below this value the PDF is treated as scanned.
 *
 * Rationale: a one-line footer or a barely-visible watermark can produce ~20
 * chars even inside a fully scanned PDF; 100 chars is a safer baseline that
 * typically represents at least one proper text block.
 */
const MIN_TEXT_CHARS = 100;

/**
 * Maximum number of bytes to scan for text content.  Processing a 10 MB PDF
 * fully in memory is fine, but this cap avoids pathological edge cases with
 * unusually large files.
 */
const MAX_SCAN_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * DocumentTypeDetectionService
 *
 * Lightweight, dependency-free stage that classifies a document into:
 *   • text-based-pdf   (native text extraction)
 *   • scanned-pdf      (OCR required)
 *   • image-document   (OCR required)
 *
 * Must run *after* DocumentInspectionService (which guarantees the file is
 * valid, non-corrupted, and non-password-protected) and *before* any
 * text-extraction or OCR stage.
 */
@Injectable()
export class DocumentTypeDetectionService {
  private readonly logger = new Logger(DocumentTypeDetectionService.name);

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  detect(
    buffer: Buffer,
    fileType: InspectionFileType,
  ): DocumentTypeResultDto {
    if (fileType === 'jpeg' || fileType === 'png') {
      return this.buildResult(
        'image-document',
        'image-ocr',
        `File is a ${fileType.toUpperCase()} raster image; OCR extraction required.`,
        0,
      );
    }

    if (fileType === 'pdf') {
      return this.classifyPdf(buffer);
    }

    // Should not reach here after inspection, but handle gracefully.
    return this.buildResult(
      'image-document',
      'image-ocr',
      'Unknown file type defaulted to image-ocr pipeline.',
      0,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PDF classification
  // ──────────────────────────────────────────────────────────────────────────

  private classifyPdf(buffer: Buffer): DocumentTypeResultDto {
    const textLength = this.extractTextFromPdfBuffer(buffer);

    this.logger.debug(
      `PDF text scan: ${textLength} printable chars found (threshold: ${MIN_TEXT_CHARS})`,
    );

    if (textLength >= MIN_TEXT_CHARS) {
      return this.buildResult(
        'text-based-pdf',
        'native-text-extraction',
        `Found ~${textLength} printable characters in uncompressed PDF content streams.`,
        textLength,
      );
    }

    const reason =
      textLength === 0
        ? 'No readable text found in uncompressed PDF content streams — likely a fully scanned document.'
        : `Only ${textLength} printable characters found (threshold: ${MIN_TEXT_CHARS}) — likely a scanned document with minimal embedded text.`;

    return this.buildResult('scanned-pdf', 'ocr', reason, textLength);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PDF text extraction (dependency-free, operates on raw bytes)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scans the raw PDF buffer for text rendered via PDF content-stream operators
   * in *uncompressed* streams only.  Compressed streams (FlateDecode, etc.) are
   * intentionally ignored — their content is unreadable as plain text, which is
   * exactly the signal we need: if a PDF's text lives entirely inside compressed
   * streams it could still be text-based, but we cannot tell without decompressing.
   *
   * Strategy:
   *  1. Locate all `stream … endstream` blocks that are NOT preceded by a
   *     `/Filter` dictionary entry (i.e. uncompressed).
   *  2. Within each uncompressed stream, scan for PDF text-show operators:
   *       (text) Tj          — show text string
   *       [(text) …] TJ      — show text array (kerned)
   *       (text) '           — move-to-next-line and show text
   *       (text) "           — set-spacing, move, show text
   *  3. Extract the parenthesised string literals and count printable ASCII chars.
   *
   * Why this is reliable:
   *  • True scanned PDFs embed pages as `/Image` XObjects with no text operators
   *    at all — extractedTextLength will be 0 or very small.
   *  • Digitally created PDFs always expose text operators in at least some
   *    uncompressed or partially-compressed streams.
   *  • The threshold guards against the rare case where a cover page or footer
   *    in an otherwise-scanned PDF contains a small amount of embedded text.
   */
  private extractTextFromPdfBuffer(buffer: Buffer): number {
    const scanBuf = buffer.slice(0, MAX_SCAN_BYTES);

    // Convert to latin1 so every byte is a printable char — avoids UTF-8
    // multi-byte decoding issues for binary stream data.
    const raw = scanBuf.toString('latin1');

    let totalChars = 0;

    // ── Step 1: find stream … endstream blocks ────────────────────────────
    // Pattern captures the dictionary text that precedes each stream so we
    // can check for /Filter entries.
    const streamBlockRe = /stream\r?\n([\s\S]*?)endstream/g;

    // We also need to look back at the dictionary preceding each stream to
    // detect compressed streams. We do this by maintaining the last ~1 KB of
    // text before each stream start.
    let match: RegExpExecArray | null;
    let searchStart = 0;

    while ((match = streamBlockRe.exec(raw)) !== null) {
      const streamStart = match.index;

      // Grab up to 512 bytes preceding the `stream` keyword to find the
      // object dictionary.
      const dictSlice = raw.slice(Math.max(0, streamStart - 512), streamStart);

      // If the preceding dictionary contains /Filter, the stream is
      // compressed — skip it.
      if (/\/Filter\s*[\[/]/.test(dictSlice)) {
        continue;
      }

      const streamContent = match[1];
      totalChars += this.countTextInContentStream(streamContent);

      // Short-circuit: once we have enough evidence, stop scanning.
      if (totalChars >= MIN_TEXT_CHARS * 3) break;
    }

    // ── Step 2: also scan outside streams for inline text in older PDFs ───
    // Some old-style PDFs embed BT/ET blocks directly in the page object
    // without a proper stream wrapper.
    if (totalChars < MIN_TEXT_CHARS) {
      totalChars += this.countTextInContentStream(raw);
    }

    return totalChars;
  }

  /**
   * Counts printable ASCII characters found in PDF text-show operator
   * arguments within a content-stream string.
   */
  private countTextInContentStream(content: string): number {
    let count = 0;

    // (string) Tj | (string) ' | (string) "
    const singleStringRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|T[j'"])/g;
    let m: RegExpExecArray | null;

    while ((m = singleStringRe.exec(content)) !== null) {
      count += this.countPrintableChars(m[1]);
    }

    // [(string) ...] TJ  – kerned text arrays
    const arrayRe = /\[([^\]]*)\]\s*TJ/g;
    while ((m = arrayRe.exec(content)) !== null) {
      const arrayContent = m[1];
      // Extract each parenthesised string from within the array
      const innerRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let inner: RegExpExecArray | null;
      while ((inner = innerRe.exec(arrayContent)) !== null) {
        count += this.countPrintableChars(inner[1]);
      }
    }

    return count;
  }

  /**
   * Counts printable ASCII characters (0x20–0x7E) in a raw PDF string
   * literal, which may contain PDF escape sequences (\\n, \\r, \\(, etc.)
   * and octal escapes (\\ddd).
   */
  private countPrintableChars(raw: string): number {
    let count = 0;
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '\\') {
        // Skip escape sequence — it represents a single logical char
        if (i + 1 < raw.length) {
          const next = raw[i + 1];
          if (next >= '0' && next <= '7') {
            // Octal: \ddd (up to 3 digits)
            let octalEnd = i + 2;
            while (
              octalEnd < i + 4 &&
              octalEnd < raw.length &&
              raw[octalEnd] >= '0' &&
              raw[octalEnd] <= '7'
            ) {
              octalEnd++;
            }
            const octalVal = parseInt(raw.slice(i + 1, octalEnd), 8);
            if (octalVal >= 0x20 && octalVal <= 0x7e) count++;
            i = octalEnd;
          } else {
            // Single-char escape (\n, \r, \t, \\, \(, \), etc.)
            if (next === 'n' || next === 'r' || next === 't') {
              // whitespace — count it
              count++;
            }
            i += 2;
          }
        } else {
          i++;
        }
      } else {
        const code = raw.charCodeAt(i);
        // Count printable ASCII: space (0x20) through tilde (0x7E)
        if (code >= 0x20 && code <= 0x7e) count++;
        i++;
      }
    }
    return count;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Builder
  // ──────────────────────────────────────────────────────────────────────────

  private buildResult(
    documentType: DocumentType,
    extractionMethod: ExtractionMethod,
    detectionReason: string,
    extractedTextLength: number,
  ): DocumentTypeResultDto {
    return { documentType, detectionReason, extractionMethod, extractedTextLength };
  }
}
