import { apiFetch } from '../api';

export interface ManagerReportFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  supplier?: string;
  uploadedBy?: number;
}

export interface ManagerDashboardOverview {
  summary: {
    totalProcessed: number;
    completed: number;
    partial: number;
    failed: number;
    pending: number;
  };
  averageProcessingTime: {
    averageTimeSeconds: number;
    averageTimeMinutes: number;
    totalProcessed: number;
  };
  complianceIssues: {
    duplicateCount: number;
    validationIssueCount: number;
    ocrQualityIssueCount: number;
  };
  lastUpdated: string;
}

export interface SupplierMetric {
  supplierName: string;
  supplierGstin: string;
  invoiceCount: number;
  totalSpend: number;
  averageInvoiceAmount: number;
}

export interface MonthlyTrend {
  month: string;
  invoiceCount: number;
  completedCount: number;
  failedCount: number;
}

export interface ValidationIssue {
  issueType: string;
  count: number;
  percentage: number;
}

export interface InvoiceNeedingReview {
  documentId: string;
  fileName: string;
  supplierName: string;
  status: string;
  uploadedAt: string;
  reasonForReview: string;
}

export interface ManagerDetailedReport {
  overview: ManagerDashboardOverview;
  supplierMetrics: SupplierMetric[];
  monthlyTrend: MonthlyTrend[];
  validationIssues: ValidationIssue[];
  invoicesNeedingReview: InvoiceNeedingReview[];
}

const toQueryString = (filters: ManagerReportFilters = {}) => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const query = params.toString();
  return query ? `?${query}` : '';
};

export async function getManagerDetailedReport(
  accessToken: string,
  filters: ManagerReportFilters = {},
): Promise<ManagerDetailedReport> {
  const res = await apiFetch(`/manager-reporting/dashboard/detailed${toQueryString(filters)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to load manager report');
  }

  return res.json();
}
