import { Injectable } from '@nestjs/common';
import { QualityAnalysisService } from '../robustness/quality-analysis.service';

@Injectable()
export class ExtractionQualityAnalyzerService {
  constructor(
    private readonly qualityAnalysisService: QualityAnalysisService,
  ) {}

  analyze(...args: Parameters<QualityAnalysisService['analyze']>) {
    return this.qualityAnalysisService.analyze(...args);
  }
}