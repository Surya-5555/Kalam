import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GeneratedInvoiceService } from './generated-invoice.service';
import { CreateInvoiceOrderDto, VerifyPaymentDto } from './dto/generated-invoice.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('generated-invoice')
@UseGuards(JwtAuthGuard)
export class GeneratedInvoiceController {
  constructor(private readonly service: GeneratedInvoiceService) {}

  /**
   * POST /generated-invoice/create-order
   * Creates Razorpay order and persists invoice in "pending" state.
   */
  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  createOrder(
    @GetUser('id') userId: number,
    @Body() dto: CreateInvoiceOrderDto,
  ) {
    return this.service.createOrder(userId, dto);
  }

  /**
   * POST /generated-invoice/verify-payment
   * Verifies payment signature and marks invoice as "paid".
   */
  @Post('verify-payment')
  @HttpCode(HttpStatus.OK)
  verifyPayment(
    @GetUser('id') userId: number,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.service.verifyPayment(userId, dto);
  }

  /**
   * GET /generated-invoice
   * List all invoices for the authenticated user.
   */
  @Get()
  listInvoices(@GetUser('id') userId: number) {
    return this.service.listInvoices(userId);
  }

  /**
   * GET /generated-invoice/:id
   * Get a specific invoice (must belong to requesting user).
   */
  @Get(':id')
  getInvoice(
    @Param('id') id: string,
    @GetUser('id') userId: number,
  ) {
    return this.service.getInvoice(userId, id);
  }

  /**
   * GET /generated-invoice/:id/download
   * Stream a PDF of the invoice.
   */
  @Get(':id/download')
  async downloadPdf(
    @Param('id') id: string,
    @GetUser('id') userId: number,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.service.generatePdf(userId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    });
    res.end(pdfBuffer);
  }
}
