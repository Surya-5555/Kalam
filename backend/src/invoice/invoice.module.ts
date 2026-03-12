import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PrismaService } from 'prisma/prisma.service';
import { InspectionModule } from '../inspection/inspection.module';
import { ProcessingStatusModule } from '../processing-status/processing-status.module';
import { InvoicePipelineModule } from '../invoice-pipeline/invoice-pipeline.module';

/**
 * InvoiceModule
 *
 * Owns the HTTP layer (controller + service) for invoice upload and query
 * operations.  All stage-level processing is provided by InvoicePipelineModule,
 * which is imported here to make InvoicePipelineService injectable into
 * InvoiceService.
 */
@Module({
  imports: [
    InspectionModule,
    ProcessingStatusModule,
    InvoicePipelineModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, PrismaService],
})
export class InvoiceModule {}
