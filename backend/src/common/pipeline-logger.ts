import { Logger } from '@nestjs/common';

/**
 * PipelineLogger
 *
 * Thin wrapper around NestJS Logger that emits one-line JSON structured
 * entries for every pipeline event. All messages produced by this class
 * are safe to write to any log aggregator (CloudWatch, Datadog, Loki, …).
 *
 * SAFETY POLICY — what is NEVER logged:
 *  • Extracted invoice text (could contain PII / confidential data)
 *  • Secret keys, tokens, or passwords
 *  • Supplier / buyer names, GSTIN values, or financial amounts
 *  • User email addresses or personal data
 *
 * What IS logged:
 *  • UUIDs and internal IDs (documentId, jobId, userId)
 *  • Stage names, status codes, durations
 *  • Numeric metrics (char counts, page counts, confidence scores)
 *  • Error messages from caught exceptions (not raw stack traces in production)
 */
export class PipelineLogger {
  private readonly nestLogger: Logger;

  /**
   * Per-instance start-time registry keyed by `stageKey(stage)`.
   * Populated by stageStart(); consumed by stageComplete() / stageFail()
   * to compute elapsed milliseconds.
   */
  private readonly stageTimes = new Map<string, number>();

  constructor(
    private readonly context: string,
    private readonly docId?: string,
  ) {
    this.nestLogger = new Logger(context);
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  /**
   * Return a new PipelineLogger bound to a specific document/job ID.
   * All subsequent calls will include { docId } in their log entries.
   */
  withDocId(docId: string): PipelineLogger {
    return new PipelineLogger(this.context, docId);
  }

  // ─── Stage lifecycle ──────────────────────────────────────────────────────

  /** Record that a pipeline stage has started. */
  stageStart(stage: string, meta?: Record<string, unknown>): void {
    this.stageTimes.set(this.stageKey(stage), Date.now());
    this.emit('log', 'stage.start', { stage, ...meta });
  }

  /** Record that a pipeline stage completed successfully. */
  stageComplete(stage: string, meta?: Record<string, unknown>): void {
    const durationMs = this.elapsed(stage);
    this.emit('log', 'stage.complete', { stage, durationMs, ...meta });
  }

  /** Record that a pipeline stage was intentionally skipped. */
  stageSkip(stage: string, meta?: Record<string, unknown>): void {
    this.emit('log', 'stage.skip', { stage, ...meta });
  }

  /**
   * Record that a pipeline stage failed.
   * `reason` should be an exception message — never raw content or secrets.
   */
  stageFail(stage: string, reason: string, meta?: Record<string, unknown>): void {
    const durationMs = this.elapsed(stage);
    this.emit('error', 'stage.fail', { stage, reason, durationMs, ...meta });
  }

  // ─── Generic structured events ────────────────────────────────────────────

  event(name: string, meta?: Record<string, unknown>): void {
    this.emit('log', name, meta);
  }

  warn(name: string, meta?: Record<string, unknown>): void {
    this.emit('warn', name, meta);
  }

  error(name: string, meta?: Record<string, unknown>): void {
    this.emit('error', name, meta);
  }

  debug(name: string, meta?: Record<string, unknown>): void {
    this.emit('debug', name, meta);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private emit(
    level: 'log' | 'warn' | 'error' | 'debug',
    event: string,
    meta?: Record<string, unknown>,
  ): void {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      event,
      ...(this.docId ? { docId: this.docId } : {}),
      ...(meta ?? {}),
    };

    const line = JSON.stringify(entry);

    switch (level) {
      case 'warn':  this.nestLogger.warn(line);  break;
      case 'error': this.nestLogger.error(line); break;
      case 'debug': this.nestLogger.debug(line); break;
      default:      this.nestLogger.log(line);   break;
    }
  }

  private stageKey(stage: string): string {
    return this.docId ? `${this.docId}:${stage}` : stage;
  }

  private elapsed(stage: string): number | undefined {
    const start = this.stageTimes.get(this.stageKey(stage));
    return start != null ? Date.now() - start : undefined;
  }
}
