export const ORDERED_STAGES = [
  'uploaded',
  'inspection',
  'image_preprocessing',
  'orientation_correction',
  'document_type_detection',
  'text_extraction',
  'ocr',
  'ocr_fallback',
  'ai_extraction',
  'table_reconstruction',
  'normalization',
  'validation',
  'mathematical_validation',
  'fake_invoice_detection',
  'duplicate_detection',
  'quality_analysis',
  'completed',
] as const;

export type ProcessingStage = (typeof ORDERED_STAGES)[number];

export type ProcessingStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed';

export interface StageRecord {
  stage: ProcessingStage;
  status: ProcessingStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface ProcessingStatusResponse {
  id: string;
  documentId: string;
  overallStatus: 'processing' | 'completed' | 'failed';
  currentStage: ProcessingStage;
  stages: StageRecord[];
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  // Document metadata
  originalName: string;
  fileSize: number;
  mimeType: string;
  // Only populated when overallStatus === 'completed'
  extractedData: Record<string, unknown> | null;
}
