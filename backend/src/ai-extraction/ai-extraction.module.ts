import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiExtractionService } from './ai-extraction.service';
import { GeminiProvider } from './providers/gemini.provider';
import { LLM_PROVIDER } from './interfaces/llm-provider.interface';
import { NormalizationModule } from '../normalization/normalization.module';
import { BusinessValidationModule } from '../business-validation/business-validation.module';

@Module({
  imports: [ConfigModule, NormalizationModule, BusinessValidationModule],
  providers: [
    // Bind the abstract LLM_PROVIDER token to the Gemini implementation.
    // To swap providers (OpenAI, Anthropic, Ollama etc.), replace useClass here.
    {
      provide: LLM_PROVIDER,
      useClass: GeminiProvider,
    },
    AiExtractionService,
  ],
  exports: [AiExtractionService],
})
export class AiExtractionModule {}
