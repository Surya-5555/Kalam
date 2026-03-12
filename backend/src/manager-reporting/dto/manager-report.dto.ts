// Summary card DTOs
export class InvoiceSummaryDto {
  totalProcessed: number;
  completed: number;
  partial: number;
  failed: number;
  pending: number;
}

export class AverageProcessingTimeDto {
  averageTimeSeconds: number;
  averageTimeMinutes: number;
  totalProcessed: number;
}

export class ComplianceIssuesDto {
  duplicateCount: number;
  validationIssueCount: number;
  ocrQualityIssueCount: number;
}

// Detailed reporting DTOs
export class InvoiceStatusBreakdownDto {
  status: string;
  count: number;
  percentage: number;
}

export class SupplierMetricsDto {
  supplierName: string;
  supplierGstin: string;
  invoiceCount: number;
  totalSpend: number;
  averageInvoiceAmount: number;
}

export class MonthlyTrendDto {
  month: string;
  invoiceCount: number;
  completedCount: number;
  failedCount: number;
}

export class ValidationIssueDto {
  issueType: string;
  count: number;
  percentage: number;
}

export class InvoiceNeedingReviewDto {
  documentId: string;
  fileName: string;
  supplierName: string;
  status: string;
  uploadedAt: Date;
  reasonForReview: string;
}

export class ManagerDashboardOverviewDto {
  summary: InvoiceSummaryDto;
  averageProcessingTime: AverageProcessingTimeDto;
  complianceIssues: ComplianceIssuesDto;
  lastUpdated: Date;
}

export class ManagerDetailedReportDto {
  overview: ManagerDashboardOverviewDto;
  supplierMetrics: SupplierMetricsDto[];
  monthlyTrend: MonthlyTrendDto[];
  validationIssues: ValidationIssueDto[];
  invoicesNeedingReview: InvoiceNeedingReviewDto[];
}
