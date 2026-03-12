import { Module } from '@nestjs/common';
import { GeneratedInvoiceController } from './generated-invoice.controller';
import { GeneratedInvoiceService } from './generated-invoice.service';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  imports: [RazorpayModule],
  controllers: [GeneratedInvoiceController],
  providers: [GeneratedInvoiceService, PrismaService],
})
export class GeneratedInvoiceModule {}
