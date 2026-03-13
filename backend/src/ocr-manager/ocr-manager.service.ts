import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { OcrService } from '../ocr/ocr.service';
import type { OcrPageResultDto, OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { InvoicePreprocessingService } from '../invoice-preprocessing/invoice-preprocessing.service';

const execFileAsync = promisify(execFile);
const OCR_CONFIDENCE_THRESHOLD = 65;
const MAX_OCR_PAGES = 20;

interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string; workerPort?: any };
  getDocument(params: { data: Uint8Array; standardFontDataUrl?: string }): { promise: Promise<PdfjsDocument> };
}

interface PdfjsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPage>;
  destroy(): Promise<void>;
}

interface PdfjsPage {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: {
    canvasContext: CanvasRenderingContext2D | any;
    viewport: { width: number; height: number };
    canvasFactory?: any;
  }): { promise: Promise<void> };
}

export interface OcrManagerInput {
  fileBuffer: Buffer;
  fileType: 'jpeg' | 'png' | 'pdf';
  documentType: string;
}

@Injectable()
export class OcrManagerService {
  private readonly logger = new Logger(OcrManagerService.name);
  private pdfjsLib: PdfjsLib | null = null;

  constructor(
    private readonly ocrService: OcrService,
    private readonly invoicePreprocessingService: InvoicePreprocessingService,
  ) {}

  async recognize(input: OcrManagerInput): Promise<OcrResultDto> {
    const primary = await this.runPrimary(input);
    const primaryTextStrength = this.computeTextStrength(primary);

    if (
      primary.averageConfidence >= OCR_CONFIDENCE_THRESHOLD &&
      primaryTextStrength >= 0.5
    ) {
      return {
        ...primary,
        engineUsed: 'tesseract',
        enginesTried: ['tesseract'],
        fallbackUsed: false,
      };
    }

    const enhancedTesseract = await this.runEnhancedTesseract(input);
    const softEnhancedTesseract = await this.runSoftEnhancedTesseract(input);
    const paddle = await this.runPaddleIfAvailable(input);
    const candidates = [primary, enhancedTesseract, softEnhancedTesseract, paddle].filter(
      (candidate): candidate is OcrResultDto => candidate != null,
    );

    const best = candidates.sort((left, right) => {
      const scoreLeft = this.computeCandidateScore(left);
      const scoreRight = this.computeCandidateScore(right);
      return scoreRight - scoreLeft;
    })[0] ?? primary;

    const regexFallback = this.buildRegexFallback(best, input.documentType);
    const finalResult =
      this.computeTextStrength(best) < 0.35 && regexFallback.fullText.length > best.fullText.length
        ? regexFallback
        : best;

    return {
      ...finalResult,
      enginesTried: [
        'tesseract',
        ...(enhancedTesseract ? ['tesseract-preprocessed'] : []),
        ...(softEnhancedTesseract ? ['tesseract-soft-preprocessed'] : []),
        ...(paddle ? ['paddleocr'] : []),
        ...(finalResult === regexFallback ? ['regex-fallback'] : []),
      ],
      fallbackUsed: finalResult !== primary,
      engineUsed:
        finalResult === regexFallback
          ? 'regex'
          : finalResult === paddle
            ? 'paddleocr'
            : finalResult === softEnhancedTesseract
              ? 'tesseract-preprocessed'
            : finalResult === enhancedTesseract
              ? 'tesseract-preprocessed'
              : 'tesseract',
    };
  }

  private async runPrimary(input: OcrManagerInput): Promise<OcrResultDto> {
    if (input.documentType === 'image-document') {
      return this.ocrService.recognizeImage(input.fileBuffer);
    }

    return this.ocrService.recognizeScannedPdf(input.fileBuffer);
  }

  private async runEnhancedTesseract(
    input: OcrManagerInput,
  ): Promise<OcrResultDto | null> {
    try {
      if (input.documentType === 'image-document') {
        const prepared = await this.invoicePreprocessingService.enhanceImage(
          input.fileBuffer,
          1,
        );
        const result = await this.ocrService.recognizeImage(prepared.buffer);
        return {
          ...result,
          preprocessingApplied: prepared.preprocessingApplied,
          orientationDegrees: prepared.orientationDegrees,
          deskewAngle: prepared.deskewAngle,
          blurScore: prepared.blurScore,
        };
      }

      if (input.fileType !== 'pdf') return null;

      const pages = await this.renderPdfPages(input.fileBuffer);
      const enhancedPages: OcrPageResultDto[] = [];
      const preprocessingApplied = new Set<string>();
      let totalBlurScore = 0;

      for (const page of pages) {
        const prepared = await this.invoicePreprocessingService.enhanceImage(
          page.buffer,
          page.pageNumber,
        );
        const pageResult = await this.ocrService.recognizeImage(prepared.buffer);
        const firstPage = pageResult.pages[0] ?? {
          pageNumber: page.pageNumber,
          text: '',
          confidence: 0,
          characterCount: 0,
        };

        enhancedPages.push({
          pageNumber: page.pageNumber,
          text: firstPage.text,
          confidence: firstPage.confidence,
          characterCount: firstPage.characterCount,
        });

        totalBlurScore += prepared.blurScore;
        prepared.preprocessingApplied.forEach((item) => preprocessingApplied.add(item));
      }

      return this.buildResult(enhancedPages, 'ocr', {
        preprocessingApplied: [...preprocessingApplied],
        blurScore: pages.length > 0 ? totalBlurScore / pages.length : null,
      });
    } catch (error) {
      this.logger.debug(
        `Enhanced Tesseract fallback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async runSoftEnhancedTesseract(
    input: OcrManagerInput,
  ): Promise<OcrResultDto | null> {
    try {
      if (input.documentType !== 'image-document') return null;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp') as typeof import('sharp');
      const softlyPrepared = await sharp(input.fileBuffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 2200, withoutEnlargement: true, fit: 'inside' })
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1.3, m1: 0.4, m2: 2.2 })
        .png({ compressionLevel: 1 })
        .toBuffer();

      const result = await this.ocrService.recognizeImage(softlyPrepared);
      return {
        ...result,
        preprocessingApplied: ['soft-grayscale', 'soft-normalize', 'soft-sharpen'],
      };
    } catch (error) {
      this.logger.debug(
        `Soft enhanced Tesseract fallback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async runPaddleIfAvailable(
    input: OcrManagerInput,
  ): Promise<OcrResultDto | null> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalam-paddle-'));
    const tempFile = path.join(tempDir, input.fileType === 'pdf' ? 'invoice.pdf' : 'invoice.png');

    try {
      await fs.writeFile(tempFile, input.fileBuffer);
      const { stdout } = await execFileAsync('paddleocr', [
        '--image_dir',
        tempFile,
        '--use_angle_cls',
        'true',
        '--use_gpu',
        'false',
        '--lang',
        'en',
      ]);

      const text = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');

      if (!text) return null;

      const confidenceMatches = [...stdout.matchAll(/score[:=]\s*([0-9.]+)/gi)].map(
        (match) => Number.parseFloat(match[1]),
      );
      const averageConfidence = confidenceMatches.length > 0
        ? confidenceMatches.reduce((sum, value) => sum + value, 0) / confidenceMatches.length * 100
        : 55;

      return {
        fullText: text,
        pages: [{
          pageNumber: 1,
          text,
          confidence: averageConfidence,
          characterCount: text.length,
        }],
        totalPages: 1,
        extractedCharacterCount: text.length,
        averageConfidence,
        extractionMethod: input.documentType === 'image-document' ? 'image-ocr' : 'ocr',
        hadLowConfidence: averageConfidence < OCR_CONFIDENCE_THRESHOLD,
        hadPartialFailure: false,
        engineUsed: 'paddleocr',
        enginesTried: ['paddleocr'],
        fallbackUsed: true,
      };
    } catch {
      return null;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildRegexFallback(
    source: OcrResultDto,
    documentType: string,
  ): OcrResultDto {
    const lines = source.fullText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const highSignal = lines.filter((line) => {
      return (
        /(invoice|bill|gstin|po|quantity|qty|amount|total|subtotal|cgst|sgst|igst|due date|invoice date)/i.test(line) ||
        /\d{2}[/-]\d{2}[/-]\d{2,4}/.test(line) ||
        /\b\d+(?:,\d{3})*(?:\.\d+)?\b/.test(line)
      );
    });

    const text = highSignal.join('\n');

    return {
      fullText: text || source.fullText,
      pages: source.pages,
      totalPages: source.totalPages,
      extractedCharacterCount: (text || source.fullText).length,
      averageConfidence: Math.max(source.averageConfidence, 35),
      extractionMethod: documentType === 'image-document' ? 'image-ocr' : 'ocr',
      hadLowConfidence: source.hadLowConfidence,
      hadPartialFailure: source.hadPartialFailure,
      engineUsed: 'regex',
      enginesTried: ['regex-fallback'],
      fallbackUsed: true,
    };
  }

  private computeTextStrength(result: OcrResultDto): number {
    if (!result.fullText) return 0;
    const alnumChars = (result.fullText.match(/[A-Za-z0-9]/g) ?? []).length;
    const numericSignals = (result.fullText.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) ?? []).length;
    return Math.min(1, alnumChars / 250 + numericSignals / 20);
  }

  private computeInvoiceSignalScore(result: OcrResultDto): number {
    if (!result.fullText) return 0;

    const keywords = [
      'invoice',
      'invoice no',
      'invoice date',
      'due date',
      'gstin',
      'amount',
      'total',
      'subtotal',
      'qty',
      'quantity',
      'rate',
      'bill to',
      'supplier',
      'cgst',
      'sgst',
      'igst',
    ];

    const lowered = result.fullText.toLowerCase();
    const keywordHits = keywords.reduce(
      (sum, keyword) => sum + (lowered.includes(keyword) ? 1 : 0),
      0,
    );
    const wordTokens = lowered.match(/[a-z]{3,}/g) ?? [];
    const alphaRatio =
      result.fullText.length > 0
        ? ((result.fullText.match(/[a-z]/gi) ?? []).length / result.fullText.length)
        : 0;

    return Math.min(1, keywordHits / 6 + Math.min(wordTokens.length, 60) / 120 + alphaRatio / 2);
  }

  private computeCandidateScore(result: OcrResultDto): number {
    return (
      result.averageConfidence +
      this.computeTextStrength(result) * 30 +
      this.computeInvoiceSignalScore(result) * 45
    );
  }

  private buildResult(
    pages: OcrPageResultDto[],
    extractionMethod: 'ocr' | 'image-ocr',
    extras: Partial<OcrResultDto> = {},
  ): OcrResultDto {
    const fullText = pages.map((page) => page.text).join('\n\n--- Page Break ---\n\n').trim();
    const extractedCharacterCount = pages.reduce(
      (sum, page) => sum + page.characterCount,
      0,
    );
    const averageConfidence = pages.length > 0
      ? pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length
      : 0;

    return {
      fullText,
      pages,
      totalPages: pages.length,
      extractedCharacterCount,
      averageConfidence,
      extractionMethod,
      hadLowConfidence:
        averageConfidence < OCR_CONFIDENCE_THRESHOLD || extractedCharacterCount === 0,
      hadPartialFailure: false,
      ...extras,
    };
  }

  private async renderPdfPages(
    buffer: Buffer,
  ): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
    try {
      return await this.renderPdfPagesWithPdfjs(buffer);
    } catch (error) {
      this.logger.debug(
        `pdfjs page rendering unavailable, falling back to pdftoppm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.renderPdfPagesWithPdftoppm(buffer);
    }
  }

  private async renderPdfPagesWithPdfjs(
    buffer: Buffer,
  ): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas } = require('canvas') as typeof import('canvas');

    const pdfjs = await this.loadPdfjs();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      standardFontDataUrl: this.standardFontDataUrl,
    }).promise;

    try {
      const pages: Array<{ pageNumber: number; buffer: Buffer }> = [];
      const totalPages = Math.min(doc.numPages, MAX_OCR_PAGES);

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const canvasFactory = {
          create(width: number, height: number) {
            const nextCanvas = createCanvas(Math.ceil(width), Math.ceil(height));
            return { canvas: nextCanvas, context: nextCanvas.getContext('2d') };
          },
          reset(target: any, width: number, height: number) {
            target.canvas.width = Math.ceil(width);
            target.canvas.height = Math.ceil(height);
          },
          destroy(target: any) {
            target.canvas.width = 0;
            target.canvas.height = 0;
          },
        };

        await page.render({
          canvasContext: context as any,
          viewport,
          canvasFactory,
        }).promise;

        pages.push({
          pageNumber,
          buffer: (canvas as any).toBuffer('image/png'),
        });
      }

      return pages;
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }

  private async renderPdfPagesWithPdftoppm(
    buffer: Buffer,
  ): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalam-pdftoppm-'));
    const inputPath = path.join(tempDir, 'invoice.pdf');
    const outputPrefix = path.join(tempDir, 'page');

    try {
      await fs.writeFile(inputPath, buffer);
      await execFileAsync('pdftoppm', [
        '-png',
        '-r',
        '220',
        inputPath,
        outputPrefix,
      ]);

      const files = (await fs.readdir(tempDir))
        .filter((file) => /^page-\d+\.png$/i.test(file))
        .sort((left, right) => {
          const leftPage = Number.parseInt(left.match(/(\d+)/)?.[1] ?? '0', 10);
          const rightPage = Number.parseInt(right.match(/(\d+)/)?.[1] ?? '0', 10);
          return leftPage - rightPage;
        })
        .slice(0, MAX_OCR_PAGES);

      return Promise.all(
        files.map(async (file, index) => ({
          pageNumber: index + 1,
          buffer: await fs.readFile(path.join(tempDir, file)),
        })),
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workerPath: string = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    (pdfjs.GlobalWorkerOptions as any).workerPort = null;
    this.pdfjsLib = pdfjs;
    return pdfjs;
  }
}
