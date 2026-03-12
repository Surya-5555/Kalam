import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
  OcrResultDto,
  OcrPageResultDto,
  OcrExtractionMethod,
} from './dto/ocr-result.dto';

// ─── Thresholds / Config ──────────────────────────────────────────────────────

/** Confidence below this value is flagged as low-quality (0–100). */
const LOW_CONFIDENCE_THRESHOLD = 40;

/** Minimum printable characters on a page before it is considered non-empty. */
const MIN_PAGE_CHARS = 5;

/**
 * Scale factor used when rendering PDF pages to raster images.
 * 2.5 maps the PDF's default 72 DPI coordinate space to ~180 DPI,
 * which is a good balance between OCR accuracy and memory use.
 * Raise to 3.0–4.0 for finer text at the cost of more RAM/CPU.
 */
const PDF_RENDER_SCALE = 2.5;

/**
 * Maximum number of pages to OCR in a single document.
 * Pages beyond this limit are skipped to prevent unbounded runtimes.
 */
const MAX_OCR_PAGES = 20;

/** Maximum time (ms) allowed for a single page's Tesseract recognition. */
const PER_PAGE_TIMEOUT_MS = 45_000;

/** Overall timeout (ms) for the entire OCR operation (all pages). */
const OVERALL_OCR_TIMEOUT_MS = 120_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string; workerPort: any };
  getDocument(params: { data: Uint8Array; standardFontDataUrl?: string }): { promise: Promise<PdfjsDocument> };
}

interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
  destroy(): Promise<void>;
}

interface PdfjsPage {
  getViewport(opts: { scale: number }): PdfjsViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D | any;
    viewport: PdfjsViewport;
    canvasFactory?: any;
  }): { promise: Promise<void> };
}

interface PdfjsViewport {
  width: number;
  height: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * OcrService
 *
 * Handles OCR extraction for two document types:
 *   • image-document  – JPEG/PNG fed directly to Tesseract
 *   • scanned-pdf     – each page is rendered to a PNG via pdfjs-dist + canvas,
 *                       then passed to Tesseract
 *
 * The Tesseract worker is initialised once at module startup (NestJS lifecycle)
 * and reused for all recognition requests to avoid the ~1 s init overhead.
 * Language data (~10 MB) is cached under <cwd>/tessdata on first run.
 *
 * Image preprocessing pipeline (via sharp, already installed):
 *   1. Auto-rotate from EXIF metadata
 *   2. Greyscale
 *   3. Normalize (auto-stretch contrast)
 *   4. Unsharp-mask sharpen
 *   5. Light median denoise
 */
@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);

  private tesseractWorker: any | null = null;
  private pdfjsLib: PdfjsLib | null = null;

  // ──────────────────────────────────────────────────────────────────────────
  // NestJS Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      // Dynamic import required: tesseract.js v7 ships as ESM-only
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const Tesseract = await import('tesseract.js');
      const createWorker = Tesseract.default?.createWorker ?? Tesseract.createWorker;

      const tessdataPath = path.join(process.cwd(), 'tessdata');

      // Ensure the cache directory exists so Tesseract can write tessdata on
      // first run without silently failing mid-recognition.
      const fs = await import('fs');
      if (!fs.existsSync(tessdataPath)) {
        fs.mkdirSync(tessdataPath, { recursive: true });
        this.logger.log(
          `tessdata cache dir created at ${tessdataPath} — eng.traineddata will be downloaded on first use (~10 MB)`,
        );
      } else {
        const hasTrainedData = fs
          .readdirSync(tessdataPath)
          .some((f: string) => f.endsWith('.traineddata'));
        if (!hasTrainedData) {
          this.logger.warn(
            `tessdata dir exists but English traineddata not found — will download on first OCR call (~10 MB). ` +
            `First OCR job will be slow. Re-start the server after the first successful OCR to get cached data.`,
          );
        }
      }

      this.tesseractWorker = await createWorker(['eng'], 1, {
        cachePath: tessdataPath,
        logger: () => undefined, // silence per-progress events
      });

      this.logger.log('Tesseract worker ready');
    } catch (err: any) {
      this.logger.error(`Failed to initialise Tesseract worker: ${err?.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate().catch(() => undefined);
      this.tesseractWorker = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /** Run OCR on a JPEG/PNG image buffer. */
  async recognizeImage(buffer: Buffer): Promise<OcrResultDto> {
    const preprocessed = await this.preprocessImage(buffer);
    const { text, confidence } = await this.runTesseractWithTimeout(
      preprocessed,
      PER_PAGE_TIMEOUT_MS,
    );

    const cleaned = this.cleanText(text);
    const page: OcrPageResultDto = {
      pageNumber: 1,
      text: cleaned,
      confidence,
      characterCount: cleaned.length,
    };

    return this.buildResult([page], 'image-ocr');
  }

  /** Render each page of a scanned PDF and run OCR over the resulting images. */
  async recognizeScannedPdf(buffer: Buffer): Promise<OcrResultDto> {
    return this.withOverallTimeout(
      () => this.doRecognizeScannedPdf(buffer),
      OVERALL_OCR_TIMEOUT_MS,
    );
  }

  private async doRecognizeScannedPdf(buffer: Buffer): Promise<OcrResultDto> {
    const pdfjs = await this.loadPdfjs();
    let doc: PdfjsDocument | null = null;

    try {
      doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        standardFontDataUrl: this.standardFontDataUrl,
      }).promise;
      const totalPages = doc.numPages;
      const cappedPages = Math.min(totalPages, MAX_OCR_PAGES);

      if (totalPages > MAX_OCR_PAGES) {
        this.logger.warn(
          `PDF has ${totalPages} pages; capping OCR at ${MAX_OCR_PAGES} pages`,
        );
      }

      const pages: OcrPageResultDto[] = [];
      let hadPartialFailure = false;

      for (let pageNum = 1; pageNum <= cappedPages; pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          const imageBuffer = await this.renderPdfPage(page);
          const preprocessed = await this.preprocessImage(imageBuffer);
          const { text, confidence } = await this.runTesseractWithTimeout(
            preprocessed,
            PER_PAGE_TIMEOUT_MS,
          );
          const cleaned = this.cleanText(text);

          pages.push({
            pageNumber: pageNum,
            text: cleaned,
            confidence,
            characterCount: cleaned.length,
          });

          this.logger.debug(
            `Page ${pageNum}/${cappedPages}: ${cleaned.length} chars, confidence ${confidence.toFixed(1)}`,
          );
        } catch (pageErr: any) {
          this.logger.warn(`OCR failed on page ${pageNum}: ${pageErr?.message}`);
          pages.push({ pageNumber: pageNum, text: '', confidence: 0, characterCount: 0 });
          hadPartialFailure = true;
        }
      }

      const result = this.buildResult(pages, 'ocr');
      result.hadPartialFailure = hadPartialFailure || result.hadPartialFailure;
      return result;
    } finally {
      if (doc) await doc.destroy().catch(() => undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PDF page rendering
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Renders a single pdfjs page to a PNG Buffer using the `canvas` npm package.
   * The scale factor maps PDF points → pixels (higher = better OCR, more RAM).
   */
  private async renderPdfPage(page: PdfjsPage): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas } = require('canvas') as typeof import('canvas');

    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');

    // Fill background white (PDFs are transparent by default, which confuses OCR)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Provide pdfjs with a canvas factory so it can allocate sub-canvases internally
    const canvasFactory = {
      create(w: number, h: number) {
        const c = createCanvas(Math.ceil(w), Math.ceil(h));
        return { canvas: c, context: c.getContext('2d') };
      },
      reset(cc: any, w: number, h: number) {
        cc.canvas.width = Math.ceil(w);
        cc.canvas.height = Math.ceil(h);
      },
      destroy(cc: any) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
      },
    };

    await page.render({ canvasContext: context as any, viewport, canvasFactory }).promise;

    // Export as PNG buffer
    return (canvas as any).toBuffer('image/png');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Image preprocessing (sharp)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Applies a preprocessing chain that improves Tesseract recognition:
   *   1. Auto-rotate from EXIF (fixes camera orientation issues)
   *   2. Greyscale (single-channel is faster and usually more accurate)
   *   3. Normalize (auto-stretches contrast – helps faded/low-contrast docs)
   *   4. Unsharp-mask sharpen (enhances character edges)
   *   5. Median denoise (removes salt-and-pepper noise without blurring edges)
   *
   * Output is PNG because PNG is lossless, which avoids JPEG artefacts
   * confusing the OCR engine.
   */
  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    return sharp(buffer)
      .rotate()           // 1. EXIF-based auto-rotation
      .greyscale()        // 2. Convert to single-channel greyscale
      .normalize()        // 3. Auto stretch contrast (min→0, max→255)
      .sharpen({          // 4. Unsharp-mask: enhance edges of characters
        sigma: 1.2,
        m1: 0.5,
        m2: 2.5,
      })
      .median(3)          // 5. 3×3 median filter for noise reduction
      .png({ compressionLevel: 1 }) // fast PNG for Tesseract
      .toBuffer();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tesseract OCR
  // ──────────────────────────────────────────────────────────────────────────

  private async runTesseract(
    imageBuffer: Buffer,
  ): Promise<{ text: string; confidence: number }> {
    if (!this.tesseractWorker) {
      this.logger.warn('Tesseract worker not available; returning empty result');
      return { text: '', confidence: 0 };
    }

    try {
      const result = await this.tesseractWorker.recognize(imageBuffer);
      const { text, confidence } = result.data;
      return { text: text ?? '', confidence: confidence ?? 0 };
    } catch (err: any) {
      this.logger.error(`Tesseract recognition error: ${err?.message}`);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * Wraps runTesseract with a per-call timeout.
   * If Tesseract hangs (e.g. on first-run tessdata download stall), the
   * promise rejects after `timeoutMs` so the page can be marked as failed
   * rather than blocking the whole pipeline.
   */
  private async runTesseractWithTimeout(
    imageBuffer: Buffer,
    timeoutMs: number,
  ): Promise<{ text: string; confidence: number }> {
    return this.withTimeout(
      () => this.runTesseract(imageBuffer),
      timeoutMs,
      `Tesseract recognition timed out after ${timeoutMs / 1000}s`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Timeout helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Races a factory-produced promise against a rejection timeout.
   * On timeout the error message is thrown so callers can handle gracefully.
   */
  private withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(message)),
        timeoutMs,
      );

      fn().then(
        (value) => { clearTimeout(timer); resolve(value); },
        (err)   => { clearTimeout(timer); reject(err); },
      );
    });
  }

  /**
   * Wraps the entire OCR operation with an overall timeout.
   * On timeout, returns a failed result with hadPartialFailure=true rather
   * than propagating an exception, so the pipeline can continue.
   */
  private async withOverallTimeout(
    fn: () => Promise<OcrResultDto>,
    timeoutMs: number,
  ): Promise<OcrResultDto> {
    try {
      return await this.withTimeout(fn, timeoutMs, `OCR timed out after ${timeoutMs / 1000}s`);
    } catch (err: any) {
      this.logger.error(`OCR overall timeout or failure: ${err?.message}`);
      const fallback: OcrResultDto = {
        fullText: '',
        pages: [],
        totalPages: 0,
        extractedCharacterCount: 0,
        averageConfidence: 0,
        extractionMethod: 'ocr',
        hadLowConfidence: true,
        hadPartialFailure: true,
      };
      return fallback;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Text cleaning
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Removes Tesseract-specific artefacts while preserving invoice content.
   *
   * Rules:
   *  - Strip null/replacement chars
   *  - Remove form-feed characters (Tesseract page separators)
   *  - Collapse runs of identical non-alphanumeric fill chars (----, ....)
   *  - Collapse horizontal whitespace within lines
   *  - Trim each line
   *  - Reduce 3+ blank lines to 2
   */
  private cleanText(raw: string): string {
    return raw
      .replace(/[\u0000\uFFFD\f]/g, '')
      .replace(/([^a-zA-Z0-9\s])\1{2,}/g, '$1$1')
      .replace(/[^\S\n]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Result builder
  // ──────────────────────────────────────────────────────────────────────────

  private buildResult(
    pages: OcrPageResultDto[],
    method: OcrExtractionMethod,
  ): OcrResultDto {
    const nonEmptyPages = pages.filter((p) => p.characterCount >= MIN_PAGE_CHARS);

    const fullText = nonEmptyPages
      .map((p) => p.text)
      .join('\n\n--- Page Break ---\n\n');

    const extractedCharacterCount = pages.reduce((s, p) => s + p.characterCount, 0);

    const avgConfidence =
      nonEmptyPages.length > 0
        ? nonEmptyPages.reduce((s, p) => s + p.confidence, 0) / nonEmptyPages.length
        : 0;

    const hadLowConfidence =
      pages.some((p) => p.characterCount >= MIN_PAGE_CHARS && p.confidence < LOW_CONFIDENCE_THRESHOLD) ||
      extractedCharacterCount === 0;

    return {
      fullText,
      pages,
      totalPages: pages.length,
      extractedCharacterCount,
      averageConfidence: Math.round(avgConfidence * 10) / 10,
      extractionMethod: method,
      hadLowConfidence,
      hadPartialFailure: false,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // pdfjs loader (lazy, cached)
  // ──────────────────────────────────────────────────────────────────────────

  /** Resolves the file:// URL for pdfjs-dist's standard font data directory. */
  private get standardFontDataUrl(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fontsDir: string = require.resolve('pdfjs-dist/standard_fonts/FoxitFixed.pfb')
      .replace(/FoxitFixed\.pfb$/, '');
    return pathToFileURL(fontsDir).href;
  }

  private async loadPdfjs(): Promise<PdfjsLib> {
    if (this.pdfjsLib) return this.pdfjsLib;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const pdfjs: PdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // pdfjs-dist v5 requires a non-empty workerSrc — an empty string is falsy
    // and throws "No GlobalWorkerOptions.workerSrc specified" at render time.
    // Resolve the packaged worker file and pass it as a file:// URL so that
    // Node.js worker_threads can load it correctly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workerPath: string = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    (pdfjs.GlobalWorkerOptions as any).workerPort = null;

    this.pdfjsLib = pdfjs;
    return pdfjs;
  }
}
