export type InspectionFileType = 'pdf' | 'jpeg' | 'png' | 'unknown';

export type InspectionNextStep = 'proceed' | 'manual_review' | 'reject';

export class InspectionResultDto {
  /** Whether the file passed all hard validation checks */
  isValid: boolean;

  /** Detected file type from magic bytes (not MIME header) */
  fileType: InspectionFileType;

  /** True if the PDF has an encryption dictionary present */
  isPasswordProtected: boolean;

  /** True if the file structure could not be parsed successfully */
  isCorrupted: boolean;

  /** Non-blocking quality issues that may affect extraction accuracy */
  qualityWarnings: string[];

  /** Recommended action based on inspection outcome */
  nextRecommendedStep: InspectionNextStep;
}
