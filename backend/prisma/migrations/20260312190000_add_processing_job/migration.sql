-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'processing',
    "currentStage" TEXT NOT NULL DEFAULT 'uploaded',
    "stages" JSONB NOT NULL,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_documentId_key" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_documentId_idx" ON "ProcessingJob"("documentId");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
