import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'invoices');

  constructor(private readonly prisma: PrismaService) {
    this.ensureUploadDirExists();
  }

  private ensureUploadDirExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async processUpload(file: Express.Multer.File, userId: number): Promise<{ success: boolean; documentId: string; message: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const documentId = randomUUID();
      const ext = path.extname(file.originalname);
      const filename = `${documentId}${ext}`;
      const filePath = path.join(this.uploadDir, filename);

      // Write file to the invoices directory
      fs.writeFileSync(filePath, file.buffer);

      // Save metadata to DB
      const invoice = await this.prisma.invoiceDocument.create({
        data: {
          id: documentId,
          userId: userId,
          originalName: file.originalname,
          storedName: filename,
          mimeType: file.mimetype,
          fileSize: file.size,
          storagePath: filePath,
          status: 'pending',
        },
      });

      this.logger.log(`Invoice uploaded and saved to DB: ${filename} for user ${userId}`);

      return {
        success: true,
        documentId: invoice.id,
        message: 'Invoice uploaded successfully and is pending processing'
      };
    } catch (error) {
      this.logger.error(`Error saving uploaded file or DB record: ${error.message}`);
      throw new BadRequestException('Failed to process uploaded file');
    }
  }

  async getRecentDocuments(userId: number, limit: number = 10) {
    return this.prisma.invoiceDocument.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      take: limit,
    });
  }

  async getDocumentById(id: string, userId: number) {
    const document = await this.prisma.invoiceDocument.findFirst({
      where: { id, userId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }
}
