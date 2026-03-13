import type { AiExtractionResultDto } from '../../ai-extraction/dto/ai-extraction-result.dto';
import type { DuplicateDetectionResult } from '../../duplicate-detection/dto/duplicate-detection-result.dto';
import type { InspectionResultDto } from '../../inspection/dto/inspection-result.dto';
import type { PdfTextExtractionResultDto } from '../../pdf-text-extraction/dto/pdf-text-extraction-result.dto';
import type { PipelineWarning } from '../../common/pipeline-warning';
import type { OcrResultDto } from '../../ocr/dto/ocr-result.dto';
import type { PipelineEnhancementMetadata } from '../../invoice-pipeline/dto/pipeline-io.dto';

export interface PipelineEnhancementContext {
  documentId: string;
  userId: number;
  fileBuffer: Buffer;
  workingBuffer: Buffer;
  documentType: string | null;
  inspectionResult: InspectionResultDto;
  textExtractionResult: PdfTextExtractionResultDto | null;
  ocrResult: OcrResultDto | null;
  aiResult: AiExtractionResultDto | null;
  duplicateDetection: DuplicateDetectionResult | null;
  warnings: PipelineWarning[];
  metadata: PipelineEnhancementMetadata;
}