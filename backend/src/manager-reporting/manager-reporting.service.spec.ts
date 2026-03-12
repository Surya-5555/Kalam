import { ManagerReportingService } from './manager-reporting.service';

describe('ManagerReportingService', () => {
  const prisma = {
    invoiceDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    processingJob: {
      findMany: jest.fn(),
    },
    generatedInvoice: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  let service: ManagerReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ManagerReportingService(prisma);
  });

  it('loads an empty manager dashboard cleanly', async () => {
    prisma.invoiceDocument.count.mockResolvedValue(0);
    prisma.invoiceDocument.findMany.mockResolvedValue([]);
    prisma.processingJob.findMany.mockResolvedValue([]);
    prisma.generatedInvoice.groupBy.mockResolvedValue([]);
    prisma.generatedInvoice.findMany.mockResolvedValue([]);

    const result = await service.getDetailedReport();

    expect(result.overview.summary.totalProcessed).toBe(0);
    expect(result.overview.averageProcessingTime.averageTimeSeconds).toBe(0);
    expect(result.supplierMetrics).toEqual([]);
    expect(result.monthlyTrend).toEqual([]);
    expect(result.invoicesNeedingReview).toEqual([]);
  });
});
