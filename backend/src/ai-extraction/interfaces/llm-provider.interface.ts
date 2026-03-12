export interface LlmCompletionOptions {
  /** Maximum tokens to generate. Default: 4096. */
  maxTokens?: number;
  /**
   * Sampling temperature (0 = fully deterministic, higher = more varied).
   * For structured extraction, always use 0.
   */
  temperature?: number;
}

export interface LlmProvider {
  /**
   * Send a two-turn conversation to the LLM and return the raw text reply.
   *
   * @param systemPrompt  Persistent instructions that shape model behaviour.
   * @param userPrompt    The per-request user message (the invoice text).
   * @param options       Optional generation tuning parameters.
   * @returns             Raw string response from the model.
   * @throws              On API errors, auth failures, or network timeouts.
   */
  complete(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmCompletionOptions,
  ): Promise<string>;

  /** Returns the model identifier string, used for logging and metadata. */
  getModelName(): string;
}

/** NestJS injection token for the active LLM provider. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
