import { Controller, Get, Query } from '@nestjs/common';
import { ManagerReportingService } from './manager-reporting.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  ManagerDashboardOverviewDto,
  ManagerDetailedReportDto,
} from './dto/manager-report.dto';
import { ManagerReportQueryDto } from './dto/manager-report-query.dto';

@Controller('manager-reporting')
export class ManagerReportingController {
  constructor(private readonly reportingService: ManagerReportingService) {}

  /**
   * Get dashboard overview (for managers only)
   * Shows summary cards for quick insights
   */
  @Get('dashboard/overview')
  @Roles([UserRole.MANAGER])
  async getDashboardOverview(
    @Query() query: ManagerReportQueryDto,
  ): Promise<ManagerDashboardOverviewDto> {
    return await this.reportingService.getDashboardOverview(query);
  }

  /**
   * Get detailed report (for managers only)
   * Shows comprehensive analytics with supplier metrics, trends, and issues
   */
  @Get('dashboard/detailed')
  @Roles([UserRole.MANAGER])
  async getDetailedReport(
    @Query() query: ManagerReportQueryDto,
  ): Promise<ManagerDetailedReportDto> {
    return await this.reportingService.getDetailedReport(query);
  }

  /**
   * Alias for getDashboardOverview for consistency
   */
  @Get('dashboard')
  @Roles([UserRole.MANAGER])
  async getDashboard(
    @Query() query: ManagerReportQueryDto,
  ): Promise<ManagerDashboardOverviewDto> {
    return await this.reportingService.getDashboardOverview(query);
  }
}
