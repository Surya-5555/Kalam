export type QualityStatus = 'complete' | 'partial' | 'needs_review' | 'failed';

export interface QualityAnalysisResult {
  score: number;
  status: QualityStatus;
  reasons: string[];
  missingRequiredFields: string[];
  validationErrorCount: number;
  validationWarningCount: number;
  tableCompletenessScore: number;
  ocrConfidence: number | null;
}