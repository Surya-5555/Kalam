import { Module } from '@nestjs/common';
import { MultiPageMergeService } from './multi-page-merge.service';

@Module({
  providers: [MultiPageMergeService],
  exports: [MultiPageMergeService],
})
export class MultiPageMergeModule {}