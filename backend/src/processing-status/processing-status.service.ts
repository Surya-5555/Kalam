import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import {
  ORDERED_STAGES,
  ProcessingStage,
  ProcessingStatusResponse,
  StageRecord,
} from './dto/processing-stage.dto.js';

@Injectable()
export class ProcessingStatusService {
  private readonly logger = new Logger(ProcessingStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Build the initial stages array: uploaded + inspection already completed. */
  private buildInitialStages(): StageRecord[] {
    const now = new Date().toISOString();
    return ORDERED_STAGES.map((stage) => {
      if (stage === 'uploaded') {
        return {
          stage,
          status: 'completed',
          startedAt: now,
          completedAt: now,
          failureReason: null,
        };
      }
      return {
        stage,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        failureReason: null,
      };
    });
  }

  /**
   * Create a new processing job for a document.
   * 'uploaded' stage is marked completed immediately.
   * All other stages start as pending.
   */
  async createJob(documentId: string): Promise<void> {
    const stages = this.buildInitialStages();
    await this.prisma.processingJob.create({
      data: {
        documentId,
        overallStatus: 'processing',
        currentStage: 'inspection',
        stages: JSON.parse(JSON.stringify(stages)) as object,
      },
    });
  }

  private async safeUpdate(
    documentId: string,
    updater: (stages: StageRecord[]) => void,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const job = await this.prisma.processingJob.findUnique({
        where: { documentId },
      });
      if (!job) {
        this.logger.warn(`ProcessingJob not found for documentId=${documentId}`);
        return;
      }
      const stages = (job.stages as unknown as StageRecord[]).slice();
      updater(stages);
      await this.prisma.processingJob.update({
        where: { documentId },
        data: {
          stages: JSON.parse(JSON.stringify(stages)) as object,
          ...extra,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Stage tracking DB update failed for ${documentId}: ${msg}`,
      );
    }
  }

  /** Mark a stage as running and update currentStage. */
  async startStage(documentId: string, stage: ProcessingStage): Promise<void> {
    await this.safeUpdate(
      documentId,
      (stages) => {
        const rec = stages.find((s) => s.stage === stage);
        if (rec) {
          rec.status = 'running';
          rec.startedAt = new Date().toISOString();
        }
      },
      { currentStage: stage },
    );
  }

  /** Mark a stage as completed. */
  async completeStage(
    documentId: string,
    stage: ProcessingStage,
  ): Promise<void> {
    await this.safeUpdate(documentId, (stages) => {
      const rec = stages.find((s) => s.stage === stage);
      if (rec) {
        rec.status = 'completed';
        rec.completedAt = new Date().toISOString();
        if (!rec.startedAt) rec.startedAt = rec.completedAt;
      }
    });
  }

  /** Mark a stage as skipped (e.g. ocr when text PDF, or text_extraction when scanned). */
  async skipStage(documentId: string, stage: ProcessingStage): Promise<void> {
    await this.safeUpdate(documentId, (stages) => {
      const rec = stages.find((s) => s.stage === stage);
      if (rec) {
        const now = new Date().toISOString();
        rec.status = 'skipped';
        rec.startedAt = now;
        rec.completedAt = now;
      }
    });
  }

  /** Mark the current stage as failed and close the job. */
  async failJob(
    documentId: string,
    stage: ProcessingStage,
    reason: string,
  ): Promise<void> {
    await this.safeUpdate(
      documentId,
      (stages) => {
        const rec = stages.find((s) => s.stage === stage);
        if (rec) {
          rec.status = 'failed';
          rec.completedAt = new Date().toISOString();
          if (!rec.startedAt) rec.startedAt = rec.completedAt;
          rec.failureReason = reason;
        }
      },
      {
        overallStatus: 'failed',
        currentStage: stage,
        failureReason: reason,
        completedAt: new Date().toISOString(),
      },
    );
  }

  /** Mark the entire job as successfully completed. */
  async completeJob(documentId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.safeUpdate(
      documentId,
      (stages) => {
        const rec = stages.find((s) => s.stage === 'completed');
        if (rec) {
          rec.status = 'completed';
          rec.startedAt = now;
          rec.completedAt = now;
        }
      },
      {
        overallStatus: 'completed',
        currentStage: 'completed',
        completedAt: now,
      },
    );
  }

  /** Fetch the full processing status for a document, scoped to the owning user. */
  async getStatus(
    documentId: string,
    userId: number,
  ): Promise<ProcessingStatusResponse> {
    const job = await this.prisma.processingJob.findFirst({
      where: {
        documentId,
        document: { userId },
      },
      include: {
        document: {
          select: {
            originalName: true,
            fileSize: true,
            mimeType: true,
            extractedData: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Processing status not found');
    }

    return {
      id: job.id,
      documentId: job.documentId,
      overallStatus: job.overallStatus as 'processing' | 'completed' | 'failed',
      currentStage: job.currentStage as ProcessingStage,
      stages: job.stages as unknown as StageRecord[],
      failureReason: job.failureReason,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      updatedAt: job.updatedAt.toISOString(),
      originalName: job.document.originalName,
      fileSize: job.document.fileSize,
      mimeType: job.document.mimeType,
      extractedData:
        (job.document.extractedData as Record<string, unknown>) ?? null,
    };
  }
}
