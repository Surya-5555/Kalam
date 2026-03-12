import { Module } from '@nestjs/common';
import { DocumentInspectionService } from './inspection.service';

@Module({
  providers: [DocumentInspectionService],
  exports: [DocumentInspectionService],
})
export class InspectionModule {}
