import { Module } from '@nestjs/common';
import { ManagerReportingService } from './manager-reporting.service';
import { ManagerReportingController } from './manager-reporting.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ManagerReportingController],
  providers: [ManagerReportingService, PrismaService],
  exports: [ManagerReportingService],
})
export class ManagerReportingModule {}
