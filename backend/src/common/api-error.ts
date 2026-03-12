/**
 * Stable error codes emitted by the invoice pipeline HTTP layer.
 * Used in ApiErrorResponse.errorCode so clients can branch on code
 * rather than parsing human-readable messages.
 */
export type ApiErrorCode =
  // HTTP / request level
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  // File / upload level
  | 'INVALID_FILE'
  | 'PASSWORD_PROTECTED'
  | 'FILE_CORRUPTED'
  | 'UPLOAD_FAILED'
  // Pipeline level
  | 'OCR_FAILED'
  | 'AI_EXTRACTION_FAILED'
  | 'PROCESSING_FAILED'
  // Generic
  | 'UNPROCESSABLE'
  | 'INTERNAL_ERROR';

/**
 * Consistent HTTP error response shape used for all 4xx/5xx responses.
 * Replaces the default NestJS exception shape.
 */
export interface ApiErrorResponse {
  success: false;
  /** Machine-readable error code — never changes across versions. */
  errorCode: ApiErrorCode | string;
  /** Human-readable message safe to display in a UI. */
  message: string;
  /** Optional extra context (e.g. inspection result, field errors). */
  details?: unknown;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Request path. */
  path: string;
}
