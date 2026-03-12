import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import {
  extractMatchFields,
  computeMatchResult,
  sortMatches,
} from './rules/match-rules';
import type {
  DuplicateDetectionResult,
  DuplicateMatch,
  DuplicateStatus,
} from './dto/duplicate-detection-result.dto';

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  /** Cap how many prior invoices we scan per call (safety guard for large tenants). */
  private static readonly MAX_CANDIDATES = 500;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect whether `normalizedInvoice` is a duplicate of any previously
   * processed invoice belonging to the same user.
   *
   * The operation is read-only: it NEVER blocks or modifies any document.
   * Any decision to reject the document must be made by the caller.
   *
   * @param normalizedInvoice  The normalized output of the current document.
   * @param currentDocumentId  Excluded from the candidate pool.
   * @param userId             Scope the search to this user's documents only.
   */
  async detect(
    normalizedInvoice: NormalizedInvoice,
    currentDocumentId: string,
    userId: number,
  ): Promise<DuplicateDetectionResult> {
    // ── 1. Fetch candidate invoices ───────────────────────────────────────────
    const candidates = await this.prisma.invoiceDocument.findMany({
      where: {
        userId,
        id: { not: currentDocumentId },
        status: { in: ['completed', 'needs_review'] },
        // Only consider documents that have extractedData with a normalizedInvoice.
        // Prisma does not support a typed JSON-not-null filter, so we post-filter below.
      },
      select: {
        id: true,
        originalName: true,
        uploadedAt: true,
        extractedData: true,
      },
      orderBy: { uploadedAt: 'desc' },
      take: DuplicateDetectionService.MAX_CANDIDATES,
    });

    // ── 2. Build match fields for the incoming invoice ────────────────────────
    const currentFields = extractMatchFields(normalizedInvoice);

    // ── 3. Compare against each candidate ────────────────────────────────────
    const matches: DuplicateMatch[] = [];
    let overallStatus: DuplicateStatus = 'no_duplicate';

    for (const candidate of candidates) {
      try {
        const data = candidate.extractedData as Record<string, unknown> | null;
        if (!data) continue;

        const candidateNormalized = (
          data.normalizedInvoice ?? null
        ) as NormalizedInvoice | null;
        if (!candidateNormalized) continue;

        const candidateFields = extractMatchFields(candidateNormalized);
        const { status, matchedFields } = computeMatchResult(
          candidateFields,
          currentFields,
        );

        if (status === 'no_duplicate') continue;

        matches.push({
          documentId: candidate.id,
          originalName: candidate.originalName,
          uploadedAt: candidate.uploadedAt.toISOString(),
          matchedFields,
          status,
        });

        // Escalate overall status — exact always wins.
        if (
          status === 'exact_duplicate' ||
          overallStatus === 'no_duplicate'
        ) {
          overallStatus = status;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Skipped candidate ${candidate.id} during duplicate check: ${msg}`,
        );
      }
    }

    return {
      status: overallStatus,
      matches: sortMatches(matches),
      checkedCount: candidates.length,
    };
  }
}
