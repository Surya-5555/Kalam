import { Injectable, Logger } from '@nestjs/common';
import {
  InspectionResultDto,
  InspectionFileType,
  InspectionNextStep,
} from './dto/inspection-result.dto';

// Maximum file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Pixel threshold for "extremely low resolution"
const MIN_IMAGE_DIMENSION = 100;

// Greyscale mean brightness thresholds (0–255)
const BLANK_DARK_THRESHOLD = 5;
const BLANK_WHITE_MEAN = 248;
const BLANK_WHITE_STDEV = 8;

/**
 * DocumentInspectionService
 *
 * Performs format, corruption, encryption, and basic quality checks on an
 * uploaded file buffer.  Intentionally decoupled from OCR / AI extraction so
 * it can be reused across any pipeline that receives a Multer file.
 */
@Injectable()
export class DocumentInspectionService {
  private readonly logger = new Logger(DocumentInspectionService.name);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async inspect(file: Express.Multer.File): Promise<InspectionResultDto> {
    const qualityWarnings: string[] = [];

    // 1. Detect real file type from magic bytes (immune to spoofed MIME headers)
    const fileType = this.detectFileType(file.buffer);

    if (fileType === 'unknown') {
      return this.build(false, fileType, false, false, [
        'Unsupported or unrecognized file format. Accepted formats: PDF, JPEG, PNG.',
      ]);
    }

    // 2. File size guard
    if (file.size > MAX_FILE_SIZE) {
      return this.build(false, fileType, false, false, [
        `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 10 MB limit.`,
      ]);
    }

    // 3. Format-specific deep inspection
    let isCorrupted = false;
    let isPasswordProtected = false;

    if (fileType === 'pdf') {
      ({ isCorrupted, isPasswordProtected } = await this.inspectPdf(
        file.buffer,
        qualityWarnings,
      ));
    } else {
      isCorrupted = await this.inspectImage(file.buffer, qualityWarnings);
    }

    const isValid = !isCorrupted && !isPasswordProtected;
    return this.build(
      isValid,
      fileType,
      isPasswordProtected,
      isCorrupted,
      qualityWarnings,
    );
  }

  // -------------------------------------------------------------------------
  // File type detection
  // -------------------------------------------------------------------------

  private detectFileType(buffer: Buffer): InspectionFileType {
    if (buffer.length < 4) return 'unknown';

    // PDF: %PDF  (25 50 44 46)
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    )
      return 'pdf';

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      return 'jpeg';

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    )
      return 'png';

    return 'unknown';
  }

  // -------------------------------------------------------------------------
  // PDF inspection
  // -------------------------------------------------------------------------

  private async inspectPdf(
    buffer: Buffer,
    warnings: string[],
  ): Promise<{ isCorrupted: boolean; isPasswordProtected: boolean }> {
    // Work with latin1 so every byte maps 1-to-1 to a JS char.
    const full = buffer.toString('latin1');

    // ------------------------------------------------------------------
    // 1. Header check – must start with %PDF-  (already confirmed by magic
    //    bytes, but double-check for truncated uploads)
    // ------------------------------------------------------------------
    if (!full.startsWith('%PDF-')) {
      return { isCorrupted: true, isPasswordProtected: false };
    }

    // ------------------------------------------------------------------
    // 2. EOF check – %%EOF must appear somewhere in the final 2 KB.
    //    Allow for trailing newlines / CR-LF / extra whitespace that
    //    some generators append after %%EOF.
    // ------------------------------------------------------------------
    const tail = full.slice(Math.max(0, full.length - 2048));
    if (!tail.includes('%%EOF')) {
      this.logger.warn('PDF missing %%EOF marker – likely truncated');
      return { isCorrupted: true, isPasswordProtected: false };
    }

    // ------------------------------------------------------------------
    // 3. Password-protection / encryption check.
    //    Scan the full document for an /Encrypt dictionary reference.
    //    We also look for the explicit /Standard filter (the most common
    //    password-protection mechanism).
    // ------------------------------------------------------------------
    if (/\/Encrypt[\s/<]/.test(full)) {
      return { isCorrupted: false, isPasswordProtected: true };
    }

    // ------------------------------------------------------------------
    // 4. Cross-reference structure check.
    //    Every valid PDF must have at least one xref table (keyword
    //    "xref") OR a cross-reference stream (keyword "/XRef").
    //    Absence of both is a reliable corruption signal.
    // ------------------------------------------------------------------
    const hasXref = full.includes('xref') || /\/XRef[\s/[<]/.test(full);
    if (!hasXref) {
      this.logger.warn('PDF has no xref table or xref stream – likely corrupted');
      return { isCorrupted: true, isPasswordProtected: false };
    }

    return { isCorrupted: false, isPasswordProtected: false };
  }

  // -------------------------------------------------------------------------
  // Image inspection
  // -------------------------------------------------------------------------

  /**
   * Analyses an image buffer for quality issues.
   * Returns `true` if the image itself is corrupted/unreadable.
   */
  private async inspectImage(
    buffer: Buffer,
    warnings: string[],
  ): Promise<boolean> {
    let sharp: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sharp = require('sharp');
    } catch {
      this.logger.warn('sharp is not available; skipping image quality checks');
      return false;
    }

    let metadata: any;
    let stats: any;

    try {
      metadata = await sharp(buffer).metadata();
      // Convert to greyscale for uniform brightness/contrast analysis
      stats = await sharp(buffer).greyscale().stats();
    } catch (err: any) {
      this.logger.warn(`Image parse error: ${err?.message}`);
      warnings.push(
        'Image file appears to be corrupted or cannot be decoded.',
      );
      return true; // treat as corrupted
    }

    // Resolution check
    const { width, height, orientation } = metadata as {
      width?: number;
      height?: number;
      orientation?: number;
    };

    if (width !== undefined && height !== undefined) {
      if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
        warnings.push(
          `Extremely low resolution (${width}×${height} px). ` +
            'Invoice data may not be extractable accurately.',
        );
      }
    }

    // Blank / unreadable content
    const mean: number = stats.channels[0]?.mean ?? 128;
    const stdev: number = stats.channels[0]?.stdev ?? 50;

    if (mean < BLANK_DARK_THRESHOLD) {
      warnings.push(
        'Image appears to be blank or nearly black. Content may be unreadable.',
      );
    } else if (mean > BLANK_WHITE_MEAN && stdev < BLANK_WHITE_STDEV) {
      warnings.push(
        'Image appears to be blank or nearly white with no visible content.',
      );
    }

    // Rotation / orientation from EXIF
    if (orientation && orientation !== 1) {
      const orientationLabels: Record<number, string> = {
        3: 'rotated 180°',
        6: 'rotated 90° clockwise',
        8: 'rotated 90° counter-clockwise',
      };
      const label = orientationLabels[orientation] ?? `orientation code ${orientation}`;
      warnings.push(
        `Image is ${label} according to EXIF metadata. ` +
          'Rotation may be required before extraction.',
      );
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Result builder
  // -------------------------------------------------------------------------

  private build(
    isValid: boolean,
    fileType: InspectionFileType,
    isPasswordProtected: boolean,
    isCorrupted: boolean,
    qualityWarnings: string[],
  ): InspectionResultDto {
    const nextRecommendedStep = this.nextStep(
      isValid,
      qualityWarnings,
    );
    return {
      isValid,
      fileType,
      isPasswordProtected,
      isCorrupted,
      qualityWarnings,
      nextRecommendedStep,
    };
  }

  private nextStep(
    isValid: boolean,
    warnings: string[],
  ): InspectionNextStep {
    if (!isValid) return 'reject';
    if (warnings.length > 0) return 'manual_review';
    return 'proceed';
  }
}
