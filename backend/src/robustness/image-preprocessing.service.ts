import { Injectable, Logger } from '@nestjs/common';
import type { InspectionFileType } from '../inspection/dto/inspection-result.dto';
import type {
  PreparedOcrPage,
  PreprocessingSummary,
} from './dto/image-preprocessing.dto';

const BLUR_VARIANCE_THRESHOLD = 140;
const DESKEW_MIN_ANGLE = -5;
const DESKEW_MAX_ANGLE = 5;
const DESKEW_STEP = 0.5;
const ADAPTIVE_WINDOW = 15;
const ADAPTIVE_BIAS = 12;

@Injectable()
export class ImagePreprocessingService {
  private readonly logger = new Logger(ImagePreprocessingService.name);
  private openCv: any | null = null;
  private openCvLoaded = false;

  async analyzeDocument(
    buffer: Buffer,
    fileType: InspectionFileType,
  ): Promise<PreprocessingSummary> {
    if (fileType !== 'jpeg' && fileType !== 'png') {
      return {
        fileType,
        preprocessingDeferredToOcr: true,
        preprocessingApplied: [],
        notes: ['Page-level preprocessing will run during OCR for rasterized pages.'],
        detectedOrientation: 0,
        deskewAngle: 0,
        blurScore: null,
        isBlurry: false,
      };
    }

    const prepared = await this.prepareImageForOcr(buffer, 1);

    return {
      fileType,
      preprocessingDeferredToOcr: false,
      preprocessingApplied: prepared.preprocessingApplied,
      notes: prepared.notes,
      detectedOrientation: prepared.orientationDegrees,
      deskewAngle: prepared.deskewAngle,
      blurScore: prepared.blurScore,
      isBlurry: prepared.isBlurry,
    };
  }

  async prepareImageForOcr(
    buffer: Buffer,
    pageNumber: number,
  ): Promise<PreparedOcrPage> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    const baseImage = sharp(buffer, { failOn: 'none' }).rotate();
    const metadata = await baseImage.metadata();
    const { data, info } = await baseImage
      .clone()
      .greyscale()
      .resize({ width: 512, height: 512, fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;

    const blurScore = await this.computeBlurScore(data, width, height);
    const isBlurry = blurScore < BLUR_VARIANCE_THRESHOLD;
    const orientationDegrees = this.detectOrientation(data, width, height);
    const deskewAngle = this.detectDeskewAngle(data, width, height);

    let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
    const preprocessingApplied: string[] = [];
    const notes: string[] = [];

    if (orientationDegrees !== 0) {
      pipeline = pipeline.rotate(orientationDegrees, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
      preprocessingApplied.push(`rotate:${orientationDegrees}`);
      notes.push(`Orientation corrected by ${orientationDegrees} degrees.`);
    }

    if (Math.abs(deskewAngle) >= 0.5) {
      pipeline = pipeline.rotate(-deskewAngle, {
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
      preprocessingApplied.push(`deskew:${deskewAngle.toFixed(1)}`);
      notes.push(`Deskew applied at ${deskewAngle.toFixed(1)} degrees.`);
    }

    const originalWidth = metadata.width ?? width;
    const originalHeight = metadata.height ?? height;

    if (originalWidth > 0 && originalWidth < 1600) {
      pipeline = pipeline.resize({
        width: originalWidth * 2,
        kernel: sharp.kernel.lanczos3,
      });
      preprocessingApplied.push('upscale');
    }

    pipeline = pipeline
      .greyscale()
      .normalize()
      .linear(1.08, -8)
      .median(3);

    preprocessingApplied.push('contrast-enhancement');
    preprocessingApplied.push('noise-removal');

    if (isBlurry) {
      pipeline = pipeline.sharpen({ sigma: 1.8, m1: 0.7, m2: 3.5 });
      preprocessingApplied.push('deblur-sharpen');
      notes.push(`Blur score ${blurScore.toFixed(1)} below threshold; stronger sharpening applied.`);
    } else {
      pipeline = pipeline.sharpen({ sigma: 1.2, m1: 0.5, m2: 2.5 });
      preprocessingApplied.push('sharpen');
    }

    const processed = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const thresholded = await this.applyAdaptiveThreshold(
      processed.data,
      processed.info.width,
      processed.info.height,
    );
    const denoised = this.removeBinaryNoise(
      thresholded,
      processed.info.width,
      processed.info.height,
    );

    const outputBuffer = await sharp(denoised, {
      raw: {
        width: processed.info.width,
        height: processed.info.height,
        channels: 1,
      },
    })
      .png({ compressionLevel: 1 })
      .toBuffer();

    preprocessingApplied.push('adaptive-threshold');

    return {
      pageNumber,
      buffer: outputBuffer,
      originalWidth,
      originalHeight,
      blurScore,
      isBlurry,
      orientationDegrees,
      deskewAngle,
      preprocessingApplied,
      notes,
    };
  }

  private async computeBlurScore(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): Promise<number> {
    const cvVariance = await this.computeOpenCvBlurScore(grayscale, width, height);
    if (cvVariance !== null) {
      return cvVariance;
    }

    const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const values: number[] = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let value = 0;
        let index = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            value += grayscale[(y + ky) * width + (x + kx)] * kernel[index++];
          }
        }
        values.push(value);
      }
    }

    if (values.length === 0) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  }

  private detectOrientation(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): 0 | 90 | 180 | 270 {
    const candidates: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    let bestAngle: 0 | 90 | 180 | 270 = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const angle of candidates) {
      const rotated = this.rotateGrayscale(grayscale, width, height, angle);
      const rowVariance = this.computeProjectionVariance(
        rotated.data,
        rotated.width,
        rotated.height,
      );
      const totalInk = rotated.data.reduce((sum, value) => sum + (255 - value), 0);
      const upperInk = this.sumRegion(rotated.data, rotated.width, rotated.height, 'top');
      const leftInk = this.sumRegion(rotated.data, rotated.width, rotated.height, 'left');

      let bias = 0;
      if (angle === 0 || angle === 180) {
        bias = totalInk > 0 ? (upperInk - (totalInk - upperInk)) / totalInk : 0;
      } else {
        bias = totalInk > 0 ? (leftInk - (totalInk - leftInk)) / totalInk : 0;
      }

      const score = rowVariance + bias * 500;
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }

    return bestAngle;
  }

  private detectDeskewAngle(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): number {
    const binary = this.quickThreshold(grayscale);
    let bestAngle = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let angle = DESKEW_MIN_ANGLE; angle <= DESKEW_MAX_ANGLE; angle += DESKEW_STEP) {
      const rotated = this.rotateGrayscaleFree(binary, width, height, angle);
      const score = this.computeProjectionVariance(rotated, width, height);
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }

    return Math.abs(bestAngle) < 0.5 ? 0 : Number(bestAngle.toFixed(1));
  }

  private computeProjectionVariance(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): number {
    const rows = new Array<number>(height).fill(0);

    for (let y = 0; y < height; y++) {
      let rowInk = 0;
      for (let x = 0; x < width; x++) {
        rowInk += 255 - grayscale[y * width + x];
      }
      rows[y] = rowInk;
    }

    const mean = rows.reduce((sum, value) => sum + value, 0) / rows.length;
    return rows.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rows.length;
  }

  private sumRegion(
    grayscale: Uint8Array,
    width: number,
    height: number,
    region: 'top' | 'left',
  ): number {
    let sum = 0;
    const yLimit = Math.floor(height / 2);
    const xLimit = Math.floor(width / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (region === 'top' && y >= yLimit) continue;
        if (region === 'left' && x >= xLimit) continue;
        sum += 255 - grayscale[y * width + x];
      }
    }

    return sum;
  }

  private async applyAdaptiveThreshold(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): Promise<Uint8Array> {
    const cvThresholded = await this.applyOpenCvAdaptiveThreshold(
      grayscale,
      width,
      height,
    );
    if (cvThresholded) {
      return cvThresholded;
    }

    const integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 1; y <= height; y++) {
      for (let x = 1; x <= width; x++) {
        integral[y * (width + 1) + x] =
          grayscale[(y - 1) * width + (x - 1)] +
          integral[(y - 1) * (width + 1) + x] +
          integral[y * (width + 1) + x - 1] -
          integral[(y - 1) * (width + 1) + x - 1];
      }
    }

    const result = new Uint8Array(width * height);
    const radius = Math.floor(ADAPTIVE_WINDOW / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - radius);
        const y1 = Math.max(0, y - radius);
        const x2 = Math.min(width - 1, x + radius);
        const y2 = Math.min(height - 1, y + radius);

        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        const sum =
          integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
          integral[y1 * (width + 1) + (x2 + 1)] -
          integral[(y2 + 1) * (width + 1) + x1] +
          integral[y1 * (width + 1) + x1];

        const mean = sum / area;
        const current = grayscale[y * width + x];
        result[y * width + x] = current < mean - ADAPTIVE_BIAS ? 0 : 255;
      }
    }

    return result;
  }

  private removeBinaryNoise(
    binary: Uint8Array,
    width: number,
    height: number,
  ): Uint8Array {
    const output = new Uint8Array(binary);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let darkNeighbors = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            if (binary[(y + ky) * width + (x + kx)] === 0) {
              darkNeighbors++;
            }
          }
        }

        const idx = y * width + x;
        if (binary[idx] === 0 && darkNeighbors <= 2) {
          output[idx] = 255;
        }
        if (binary[idx] === 255 && darkNeighbors >= 7) {
          output[idx] = 0;
        }
      }
    }

    return output;
  }

  private quickThreshold(grayscale: Uint8Array): Uint8Array {
    let min = 255;
    let max = 0;
    for (const value of grayscale) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const threshold = (min + max) / 2;
    return Uint8Array.from(grayscale, (value) => (value < threshold ? 0 : 255));
  }

  private rotateGrayscale(
    grayscale: Uint8Array,
    width: number,
    height: number,
    angle: 0 | 90 | 180 | 270,
  ): { data: Uint8Array; width: number; height: number } {
    if (angle === 0) return { data: grayscale, width, height };

    const rotatedWidth = angle === 180 ? width : height;
    const rotatedHeight = angle === 180 ? height : width;
    const output = new Uint8Array(rotatedWidth * rotatedHeight).fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const source = grayscale[y * width + x];
        let rx = x;
        let ry = y;

        if (angle === 90) {
          rx = height - 1 - y;
          ry = x;
        } else if (angle === 180) {
          rx = width - 1 - x;
          ry = height - 1 - y;
        } else if (angle === 270) {
          rx = y;
          ry = width - 1 - x;
        }

        output[ry * rotatedWidth + rx] = source;
      }
    }

    return { data: output, width: rotatedWidth, height: rotatedHeight };
  }

  private rotateGrayscaleFree(
    grayscale: Uint8Array,
    width: number,
    height: number,
    angle: number,
  ): Uint8Array {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const output = new Uint8Array(width * height).fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tx = x - cx;
        const ty = y - cy;
        const sx = Math.round(tx * cos + ty * sin + cx);
        const sy = Math.round(-tx * sin + ty * cos + cy);
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          output[y * width + x] = grayscale[sy * width + sx];
        }
      }
    }

    return output;
  }

  private async computeOpenCvBlurScore(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): Promise<number | null> {
    const cv = await this.loadOpenCv();
    if (!cv) return null;

    try {
      const source = cv.matFromArray(height, width, cv.CV_8UC1, Array.from(grayscale));
      const laplacian = new cv.Mat();
      const mean = new cv.Mat();
      const stddev = new cv.Mat();
      cv.Laplacian(source, laplacian, cv.CV_64F);
      cv.meanStdDev(laplacian, mean, stddev);
      const variance = Math.pow(stddev.doubleAt(0, 0), 2);
      source.delete();
      laplacian.delete();
      mean.delete();
      stddev.delete();
      return variance;
    } catch (error) {
      this.logger.debug(
        `OpenCV blur score fallback triggered: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async applyOpenCvAdaptiveThreshold(
    grayscale: Uint8Array,
    width: number,
    height: number,
  ): Promise<Uint8Array | null> {
    const cv = await this.loadOpenCv();
    if (!cv) return null;

    try {
      const source = cv.matFromArray(height, width, cv.CV_8UC1, Array.from(grayscale));
      const destination = new cv.Mat();
      cv.adaptiveThreshold(
        source,
        destination,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        25,
        11,
      );
      const output = Uint8Array.from(destination.data);
      source.delete();
      destination.delete();
      return output;
    } catch (error) {
      this.logger.debug(
        `OpenCV adaptive threshold fallback triggered: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async loadOpenCv(): Promise<any | null> {
    if (this.openCvLoaded) return this.openCv;

    this.openCvLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const mod = await import('@techstark/opencv-js');
      this.openCv = mod.default ?? mod;
    } catch (error) {
      this.openCv = null;
      this.logger.debug(
        `OpenCV unavailable, using sharp/custom fallbacks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.openCv;
  }
}