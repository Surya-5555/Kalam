export interface PreparedOcrPage {
  pageNumber: number;
  buffer: Buffer;
  originalWidth: number;
  originalHeight: number;
  blurScore: number;
  isBlurry: boolean;
  orientationDegrees: 0 | 90 | 180 | 270;
  deskewAngle: number;
  preprocessingApplied: string[];
  notes: string[];
}

export interface PreprocessingSummary {
  fileType: string;
  preprocessingDeferredToOcr: boolean;
  preprocessingApplied: string[];
  notes: string[];
  detectedOrientation: 0 | 90 | 180 | 270;
  deskewAngle: number;
  blurScore: number | null;
  isBlurry: boolean;
}