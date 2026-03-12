import { Module } from '@nestjs/common';
import { DocumentTypeDetectionService } from './document-type.service';

@Module({
  providers: [DocumentTypeDetectionService],
  exports: [DocumentTypeDetectionService],
})
export class DocumentTypeModule {}
