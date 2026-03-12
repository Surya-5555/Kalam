import { Module } from '@nestjs/common';
import { ProcessingStatusService } from './processing-status.service.js';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  providers: [ProcessingStatusService, PrismaService],
  exports: [ProcessingStatusService],
})
export class ProcessingStatusModule {}
