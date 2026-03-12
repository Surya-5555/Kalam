-- AlterTable
ALTER TABLE "ProcessingJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "GeneratedInvoice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TEXT NOT NULL,
    "placeOfSupply" TEXT NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "supplierAddress" TEXT NOT NULL,
    "supplierPhone" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "cgst" DOUBLE PRECISION NOT NULL,
    "sgst" DOUBLE PRECISION NOT NULL,
    "igst" DOUBLE PRECISION NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "taxTotal" DOUBLE PRECISION NOT NULL,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedInvoice_razorpayOrderId_key" ON "GeneratedInvoice"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "GeneratedInvoice_userId_idx" ON "GeneratedInvoice"("userId");

-- AddForeignKey
ALTER TABLE "GeneratedInvoice" ADD CONSTRAINT "GeneratedInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
