import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  InvoiceSummaryDto,
  AverageProcessingTimeDto,
  ComplianceIssuesDto,
  ManagerDashboardOverviewDto,
  ManagerDetailedReportDto,
  SupplierMetricsDto,
  MonthlyTrendDto,
  ValidationIssueDto,
  InvoiceNeedingReviewDto,
} from './dto/manager-report.dto';
import { ManagerReportQueryDto } from './dto/manager-report-query.dto';

@Injectable()
export class ManagerReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get dashboard overview for managers
   */
  async getDashboardOverview(
    filters: ManagerReportQueryDto = {},
  ): Promise<ManagerDashboardOverviewDto> {
    const [summary, processingTime, complianceIssues] = await Promise.all([
      this.getInvoiceSummary(filters),
      this.getAverageProcessingTime(filters),
      this.getComplianceIssues(filters),
    ]);

    return {
      summary,
      averageProcessingTime: processingTime,
      complianceIssues,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get detailed report with all insights
   */
  async getDetailedReport(
    filters: ManagerReportQueryDto = {},
  ): Promise<ManagerDetailedReportDto> {
    const [
      overview,
      supplierMetrics,
      monthlyTrend,
      validationIssues,
      invoicesNeedingReview,
    ] = await Promise.all([
      this.getDashboardOverview(filters),
      this.getSupplierMetrics(filters),
      this.getMonthlyTrend(filters),
      this.getValidationIssues(),
      this.getInvoicesNeedingReview(filters),
    ]);

    return {
      overview,
      supplierMetrics,
      monthlyTrend,
      validationIssues,
      invoicesNeedingReview,
    };
  }

  /**
   * Get invoice processing summary
   */
  private async getInvoiceSummary(
    filters: ManagerReportQueryDto,
  ): Promise<InvoiceSummaryDto> {
    const where = this.buildInvoiceWhere(filters);
    const [total, completed, failed, pending] = await Promise.all([
      this.prisma.invoiceDocument.count({ where }),
      this.prisma.invoiceDocument.count({
        where: { ...where, status: 'completed' },
      }),
      this.prisma.invoiceDocument.count({
        where: { ...where, status: 'failed' },
      }),
      this.prisma.invoiceDocument.count({
        where: { ...where, status: 'pending' },
      }),
    ]);

    const partial = total - completed - failed - pending;

    return {
      totalProcessed: total,
      completed,
      partial: Math.max(partial, 0),
      failed,
      pending,
    };
  }

  /**
   * Get average processing time
   */
  private async getAverageProcessingTime(
    filters: ManagerReportQueryDto,
  ): Promise<AverageProcessingTimeDto> {
    const where = this.buildProcessingJobWhere(filters);
    const processedJobs = await this.prisma.processingJob.findMany({
      where: {
        ...where,
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    if (processedJobs.length === 0) {
      return {
        averageTimeSeconds: 0,
        averageTimeMinutes: 0,
        totalProcessed: 0,
      };
    }

    const totalTimeMs = processedJobs.reduce((sum, job) => {
      const time =
        job.completedAt!.getTime() - job.startedAt!.getTime();
      return sum + time;
    }, 0);

    const averageTimeMs = totalTimeMs / processedJobs.length;
    const averageTimeSeconds = Math.round(averageTimeMs / 1000);
    const averageTimeMinutes = Math.round(averageTimeSeconds / 60);

    return {
      averageTimeSeconds,
      averageTimeMinutes,
      totalProcessed: processedJobs.length,
    };
  }

  /**
   * Get compliance issues count (duplicates, validation errors, OCR quality)
   */
  private async getComplianceIssues(
    filters: ManagerReportQueryDto,
  ): Promise<ComplianceIssuesDto> {
    // Note: These would need to be tracked in the database
    // For now, returning placeholder counts
    // In production, you would extend InvoiceDocument and ProcessingJob
    // to track these issues explicitly

    const where = this.buildInvoiceWhere(filters);
    const invoicesWithData = (await this.prisma.invoiceDocument.findMany({
      where,
    })).filter((invoice) => invoice.extractedData !== null);

    // Count invoices with multiple uploads (potential duplicates)
    const supplierCounts: { [key: string]: number } = {};
    let duplicateCount = 0;

    for (const invoice of invoicesWithData) {
      const data = invoice.extractedData as any;
      if (data?.supplierName) {
        supplierCounts[data.supplierName] =
          (supplierCounts[data.supplierName] || 0) + 1;
      }
    }

    // Heuristic: if supplier has >5 invoices in a day, might be duplicates
    duplicateCount = Object.values(supplierCounts).filter(
      (count) => count > 5,
    ).length;

    return {
      duplicateCount: Math.max(duplicateCount, 0),
      validationIssueCount: 0, // Would be tracked explicitly
      ocrQualityIssueCount: 0, // Would be tracked explicitly
    };
  }

  /**
   * Get supplier-wise metrics
   */
  private async getSupplierMetrics(
    filters: ManagerReportQueryDto,
  ): Promise<SupplierMetricsDto[]> {
    // Get supplier metrics from GeneratedInvoice (processed invoices)
    const suppliers = await this.prisma.generatedInvoice.groupBy({
      by: ['supplierName', 'supplierGstin'],
      where: this.buildGeneratedInvoiceWhere(filters),
      _count: {
        id: true,
      },
      _sum: {
        grandTotal: true,
      },
    });

    const metrics = await Promise.all(
      suppliers.map(async (supplier) => {
        const invoices = await this.prisma.generatedInvoice.findMany({
          where: {
            supplierName: supplier.supplierName,
            supplierGstin: supplier.supplierGstin,
            ...this.buildGeneratedInvoiceWhere(filters),
          },
        });

        const averageAmount =
          invoices.length > 0
            ? invoices.reduce((sum, inv) => sum + inv.grandTotal, 0) /
              invoices.length
            : 0;

        return {
          supplierName: supplier.supplierName,
          supplierGstin: supplier.supplierGstin,
          invoiceCount: supplier._count.id,
          totalSpend: supplier._sum.grandTotal || 0,
          averageInvoiceAmount: averageAmount,
        };
      }),
    );

    return metrics.sort((a, b) => b.invoiceCount - a.invoiceCount).slice(0, 10);
  }

  /**
   * Get monthly invoice volume trend
   */
  private async getMonthlyTrend(
    filters: ManagerReportQueryDto,
  ): Promise<MonthlyTrendDto[]> {
    const invoices = await this.prisma.invoiceDocument.findMany({
      where: this.buildInvoiceWhere(filters),
      select: {
        uploadedAt: true,
        status: true,
      },
      orderBy: {
        uploadedAt: 'asc',
      },
    });

    // Group by month
    const monthlyData: { [key: string]: MonthlyTrendDto } = {};

    invoices.forEach((invoice) => {
      const date = new Date(invoice.uploadedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          invoiceCount: 0,
          completedCount: 0,
          failedCount: 0,
        };
      }

      monthlyData[monthKey].invoiceCount++;
      if (invoice.status === 'completed') {
        monthlyData[monthKey].completedCount++;
      } else if (invoice.status === 'failed') {
        monthlyData[monthKey].failedCount++;
      }
    });

    return Object.values(monthlyData).sort((a, b) =>
      a.month.localeCompare(b.month),
    );
  }

  /**
   * Get validation issues breakdown
   */
  private async getValidationIssues(): Promise<ValidationIssueDto[]> {
    // Note: This would require explicit tracking in the database
    // For now returning placeholder data
    const issues: ValidationIssueDto[] = [
      { issueType: 'Missing Fields', count: 0, percentage: 0 },
      { issueType: 'Invalid Format', count: 0, percentage: 0 },
      { issueType: 'GSTIN Mismatch', count: 0, percentage: 0 },
      { issueType: 'Amount Discrepancy', count: 0, percentage: 0 },
    ];

    return issues;
  }

  /**
   * Get invoices needing review
   */
  private async getInvoicesNeedingReview(
    filters: ManagerReportQueryDto,
  ): Promise<InvoiceNeedingReviewDto[]> {
    const where = this.buildInvoiceWhere(filters);
    const invoicesToReview = await this.prisma.invoiceDocument.findMany({
      where: {
        ...where,
        status: { in: ['processing', 'failed'] },
      },
      select: {
        id: true,
        originalName: true,
        status: true,
        uploadedAt: true,
        extractedData: true,
      },
      take: 20,
      orderBy: {
        uploadedAt: 'desc',
      },
    });

    return invoicesToReview.map((invoice) => {
      const data = invoice.extractedData as any;
      return {
        documentId: invoice.id,
        fileName: invoice.originalName,
        supplierName: data?.supplierName || 'Unknown',
        status: invoice.status,
        uploadedAt: invoice.uploadedAt,
        reasonForReview:
          invoice.status === 'failed'
            ? 'Processing Failed'
            : 'Still Processing',
      };
    });
  }

  private buildInvoiceWhere(
    filters: ManagerReportQueryDto,
  ): Prisma.InvoiceDocumentWhereInput {
    const where: Prisma.InvoiceDocumentWhereInput = {};

    if (filters.dateFrom || filters.dateTo) {
      where.uploadedAt = {};

      if (filters.dateFrom) {
        where.uploadedAt.gte = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.uploadedAt.lte = endDate;
      }
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.uploadedBy) {
      where.userId = Number(filters.uploadedBy);
    }

    return where;
  }

  private buildProcessingJobWhere(
    filters: ManagerReportQueryDto,
  ): Prisma.ProcessingJobWhereInput {
    const where: Prisma.ProcessingJobWhereInput = {};
    const documentWhere = this.buildInvoiceWhere(filters);

    if (Object.keys(documentWhere).length > 0) {
      where.document = { is: documentWhere };
    }

    return where;
  }

  private buildGeneratedInvoiceWhere(
    filters: ManagerReportQueryDto,
  ): Prisma.GeneratedInvoiceWhereInput {
    const where: Prisma.GeneratedInvoiceWhereInput = {};

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};

      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    if (filters.uploadedBy) {
      where.userId = Number(filters.uploadedBy);
    }

    if (filters.supplier) {
      where.supplierName = {
        contains: filters.supplier,
        mode: 'insensitive',
      };
    }

    return where;
  }
}
