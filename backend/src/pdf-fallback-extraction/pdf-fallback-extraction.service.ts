import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { PdfTextExtractionResultDto } from '../pdf-text-extraction/dto/pdf-text-extraction-result.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class PdfFallbackExtractionService {
  private readonly logger = new Logger(PdfFallbackExtractionService.name);

  async extract(buffer: Buffer): Promise<PdfTextExtractionResultDto | null> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalam-pdftotext-'));
    const inputPath = path.join(tempDir, 'document.pdf');

    try {
      await fs.writeFile(inputPath, buffer);
      const { stdout } = await execFileAsync('pdftotext', [
        '-layout',
        '-enc',
        'UTF-8',
        inputPath,
        '-',
      ], {
        maxBuffer: 20 * 1024 * 1024,
      });

      const normalized = stdout.replace(/\r\n/g, '\n');
      const rawPages = normalized.split('\f');
      const pages = rawPages
        .map((text, index) => {
          const cleaned = text.trim();
          return {
            pageNumber: index + 1,
            text: cleaned,
            characterCount: cleaned.length,
          };
        })
        .filter((page) => page.text.length > 0);

      const fullText = pages.map((page) => page.text).join('\n\n--- Page Break ---\n\n');
      const extractedCharacterCount = pages.reduce(
        (sum, page) => sum + page.characterCount,
        0,
      );

      if (extractedCharacterCount === 0) {
        return null;
      }

      return {
        fullText,
        pages,
        totalPages: pages.length,
        extractedCharacterCount,
        extractionMethod: 'native-text-extraction',
        hadPartialFailure: false,
      };
    } catch (error) {
      this.logger.warn(
        `pdftotext fallback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
