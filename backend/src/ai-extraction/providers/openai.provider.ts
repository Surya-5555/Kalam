import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProvider,
  LlmCompletionOptions,
} from '../interfaces/llm-provider.interface';

// ─── OpenAI HTTP response shape (minimal) ────────────────────────────────────

interface OpenAiMessage {
  role: string;
  content: string;
}

interface OpenAiChoice {
  message: OpenAiMessage;
  finish_reason: string;
}

interface OpenAiChatResponse {
  choices: OpenAiChoice[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class OpenAiProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') ?? '';
    this.model =
      this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    this.baseUrl =
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';

    if (!this.apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not configured — AI extraction will fail at runtime. ' +
          'Set OPENAI_API_KEY in your .env file.',
      );
    }
  }

  getModelName(): string {
    return this.model;
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    options: LlmCompletionOptions = {},
  ): Promise<string> {
    const { maxTokens = 4096, temperature = 0 } = options;

    if (!this.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Cannot perform AI extraction.',
      );
    }

    const requestBody = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
      // Instructs the model to return valid JSON at the API level.
      // Supported by gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo-1106+.
      response_format: { type: 'json_object' },
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `OpenAI API returned ${response.status}: ${errorBody.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        `OpenAI returned an empty completion (finish_reason: ${data.choices?.[0]?.finish_reason ?? 'unknown'})`,
      );
    }

    return content;
  }
}
