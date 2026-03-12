import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmProvider,
  LlmCompletionOptions,
} from '../interfaces/llm-provider.interface';

// ─── Gemini REST API response shape (minimal) ────────────────────────────────

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { code: number; message: string; status: string };
}

type GeminiSchema = {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'OBJECT' | 'ARRAY';
  nullable?: boolean;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
};

const nullableString = (): GeminiSchema => ({ type: 'STRING', nullable: true });
const nullableNumber = (): GeminiSchema => ({ type: 'NUMBER', nullable: true });

const INVOICE_EXTRACTION_RESPONSE_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    supplier: {
      type: 'OBJECT',
      properties: {
        name: nullableString(),
        address: nullableString(),
        city: nullableString(),
        state: nullableString(),
        country: nullableString(),
        postalCode: nullableString(),
        phone: nullableString(),
        email: nullableString(),
        taxId: nullableString(),
        website: nullableString(),
        confidence: { type: 'NUMBER' },
      },
      required: [
        'name',
        'address',
        'city',
        'state',
        'country',
        'postalCode',
        'phone',
        'email',
        'taxId',
        'website',
        'confidence',
      ],
    },
    buyer: {
      type: 'OBJECT',
      properties: {
        name: nullableString(),
        address: nullableString(),
        city: nullableString(),
        state: nullableString(),
        country: nullableString(),
        postalCode: nullableString(),
        phone: nullableString(),
        email: nullableString(),
        taxId: nullableString(),
        confidence: { type: 'NUMBER' },
      },
      required: [
        'name',
        'address',
        'city',
        'state',
        'country',
        'postalCode',
        'phone',
        'email',
        'taxId',
        'confidence',
      ],
    },
    invoice: {
      type: 'OBJECT',
      properties: {
        invoiceNumber: nullableString(),
        invoiceNumberCandidates: {
          type: 'ARRAY',
          nullable: true,
          items: { type: 'STRING' },
        },
        invoiceDate: nullableString(),
        dueDate: nullableString(),
        purchaseOrderNumber: nullableString(),
        currency: nullableString(),
        paymentTerms: nullableString(),
        paymentTermsDays: nullableNumber(),
        notes: nullableString(),
        confidence: { type: 'NUMBER' },
      },
      required: [
        'invoiceNumber',
        'invoiceNumberCandidates',
        'invoiceDate',
        'dueDate',
        'purchaseOrderNumber',
        'currency',
        'paymentTerms',
        'paymentTermsDays',
        'notes',
        'confidence',
      ],
    },
    lineItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          lineNumber: { type: 'NUMBER' },
          description: nullableString(),
          quantity: nullableNumber(),
          unit: nullableString(),
          unitPrice: nullableNumber(),
          discount: nullableNumber(),
          discountType: {
            type: 'STRING',
            nullable: true,
            enum: ['percentage', 'fixed'],
          },
          subtotal: nullableNumber(),
          taxRate: nullableNumber(),
          taxAmount: nullableNumber(),
          total: nullableNumber(),
          confidence: { type: 'NUMBER' },
        },
        required: [
          'lineNumber',
          'description',
          'quantity',
          'unit',
          'unitPrice',
          'discount',
          'discountType',
          'subtotal',
          'taxRate',
          'taxAmount',
          'total',
          'confidence',
        ],
      },
    },
    taxBreakdown: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          taxType: nullableString(),
          taxRate: nullableNumber(),
          taxableAmount: nullableNumber(),
          taxAmount: nullableNumber(),
          confidence: { type: 'NUMBER' },
        },
        required: [
          'taxType',
          'taxRate',
          'taxableAmount',
          'taxAmount',
          'confidence',
        ],
      },
    },
    totals: {
      type: 'OBJECT',
      properties: {
        subtotal: nullableNumber(),
        totalDiscount: nullableNumber(),
        totalTax: nullableNumber(),
        shippingAndHandling: nullableNumber(),
        grandTotal: nullableNumber(),
        amountPaid: nullableNumber(),
        amountDue: nullableNumber(),
        confidence: { type: 'NUMBER' },
      },
      required: [
        'subtotal',
        'totalDiscount',
        'totalTax',
        'shippingAndHandling',
        'grandTotal',
        'amountPaid',
        'amountDue',
        'confidence',
      ],
    },
  },
  required: [
    'supplier',
    'buyer',
    'invoice',
    'lineItems',
    'taxBreakdown',
    'totals',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  /** Max ms to wait for a single Gemini HTTP response (default 60 s). */
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
    this.model =
      this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    this.timeoutMs =
      Number(this.config.get<string>('AI_EXTRACTION_TIMEOUT_MS') ?? '60000');

    if (!this.apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not configured — AI extraction will fail at runtime. ' +
          'Set GEMINI_API_KEY in your .env file.',
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
        'GEMINI_API_KEY is not set. Cannot perform AI extraction.',
      );
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = JSON.stringify({
      // System instruction is a first-class field in Gemini — not a content turn.
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        responseSchema: INVOICE_EXTRACTION_RESPONSE_SCHEMA,
      },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('abort'))
      ) {
        throw new Error(
          `Gemini API timed out after ${this.timeoutMs / 1000}s`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Gemini API returned ${response.status}: ${errorBody.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(
        `Gemini API error [${data.error.status}]: ${data.error.message}`,
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
      throw new Error(
        `Gemini returned an empty completion (finishReason: ${reason})`,
      );
    }

    return text;
  }
}
