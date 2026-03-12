import { Module } from '@nestjs/common';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  providers: [DuplicateDetectionService, PrismaService],
  exports: [DuplicateDetectionService],
})
export class DuplicateDetectionModule {}
