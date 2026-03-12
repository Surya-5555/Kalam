export type DuplicateStatus =
  | 'no_duplicate'
  | 'possible_duplicate'
  | 'exact_duplicate';

/**
 * A single invoice that was found to match the current one.
 */
export interface DuplicateMatch {
  /** ID of the matching InvoiceDocument. */
  documentId: string;
  /** Original file name of the matching document. */
  originalName: string;
  /** ISO 8601 timestamp of when the matching document was uploaded. */
  uploadedAt: string;
  /** Which key fields triggered the match. */
  matchedFields: string[];
  /** How strong the match is for this specific document. */
  status: Exclude<DuplicateStatus, 'no_duplicate'>;
}

/**
 * Result returned by DuplicateDetectionService.detect().
 */
export interface DuplicateDetectionResult {
  /**
   * Overall duplicate status for the current invoice:
   *  - 'no_duplicate'       — no matching invoice found
   *  - 'possible_duplicate' — one or more plausible matches detected
   *  - 'exact_duplicate'    — at least one invoice matches on all key fields
   */
  status: DuplicateStatus;

  /** All matching invoices, sorted from strongest to weakest match. */
  matches: DuplicateMatch[];

  /** Number of existing invoices that were compared against. */
  checkedCount: number;
}
