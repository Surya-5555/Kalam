export const ORDERED_STAGES = [
  'uploaded',
  'inspection',
  'document_type_detection',
  'text_extraction',
  'ocr',
  'ai_extraction',
  'normalization',
  'validation',
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
