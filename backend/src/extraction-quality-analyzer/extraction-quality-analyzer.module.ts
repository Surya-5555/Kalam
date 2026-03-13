import { Module } from '@nestjs/common';
import { RobustnessModule } from '../robustness/robustness.module';
import { ExtractionQualityAnalyzerService } from './extraction-quality-analyzer.service';

@Module({
  imports: [RobustnessModule],
  providers: [ExtractionQualityAnalyzerService],
  exports: [ExtractionQualityAnalyzerService],
})
export class ExtractionQualityAnalyzerModule {}