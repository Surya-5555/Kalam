import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { RazorpayService } from '../razorpay/razorpay.service';
import { CreateInvoiceOrderDto, VerifyPaymentDto } from './dto/generated-invoice.dto';
import { randomUUID } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

@Injectable()
export class GeneratedInvoiceService {
  private readonly logger = new Logger(GeneratedInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  private get generatedInvoiceModel(): any {
    return (this.prisma as any).generatedInvoice;
  }

  /**
   * Step 1 – Create a Razorpay order and persist the invoice in "pending" state.
   */
  async createOrder(userId: number, dto: CreateInvoiceOrderDto) {
    // Amount in paise (INR × 100)
    const amountInPaise = Math.round(dto.grandTotal * 100);
    const receipt = `inv-${randomUUID().split('-')[0]}`;

    const { orderId, amount, currency } = await this.razorpay.createOrder(
      amountInPaise,
      'INR',
      receipt,
    );

    const invoice = await this.generatedInvoiceModel.create({
      data: {
        userId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate,
        placeOfSupply: dto.placeOfSupply,
        paymentTerms: dto.paymentTerms,
        supplierName: dto.supplierName,
        supplierGstin: dto.supplierGstin,
        supplierAddress: dto.supplierAddress ?? '',
        supplierPhone: dto.supplierPhone ?? '',
        items: dto.items as any,
        cgst: dto.cgst,
        sgst: dto.sgst,
        igst: dto.igst,
        subTotal: dto.subTotal,
        taxTotal: dto.taxTotal,
        grandTotal: dto.grandTotal,
        razorpayOrderId: orderId,
        paymentStatus: 'pending',
      },
    });

    this.logger.log(`Created invoice order ${invoice.id} → Razorpay order ${orderId}`);

    return {
      invoiceId: invoice.id,
      razorpayOrderId: orderId,
      amount,
      currency,
    };
  }

  /**
   * Step 2 – Verify Razorpay payment signature and mark invoice as paid.
   */
  async verifyPayment(userId: number, dto: VerifyPaymentDto) {
    const invoice = await this.generatedInvoiceModel.findUnique({
      where: { id: dto.invoiceId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.userId !== userId) throw new ForbiddenException('Access denied');
    if (invoice.paymentStatus === 'paid') {
      return { success: true, invoiceId: invoice.id, message: 'Already paid' };
    }
    if (invoice.razorpayOrderId !== dto.razorpayOrderId) {
      throw new BadRequestException('Order ID mismatch');
    }

    const isValid = this.razorpay.verifyPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );

    if (!isValid) throw new BadRequestException('Invalid payment signature');

    await this.generatedInvoiceModel.update({
      where: { id: dto.invoiceId },
      data: {
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
        paymentStatus: 'paid',
      },
    });

    this.logger.log(`Payment verified for invoice ${dto.invoiceId}`);
    return { success: true, invoiceId: dto.invoiceId };
  }

  /**
   * Get a single generated invoice (must belong to requesting user).
   */
  async getInvoice(userId: number, id: string) {
    const invoice = await this.generatedInvoiceModel.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.userId !== userId) throw new ForbiddenException('Access denied');
    return invoice;
  }

  /**
   * List all generated invoices for a user.
   */
  async listInvoices(userId: number) {
    return this.generatedInvoiceModel.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a PDF for a paid invoice and return it as a Buffer.
   */
  async generatePdf(userId: number, id: string): Promise<Buffer> {
    const inv = await this.getInvoice(userId, id);

    if (inv.paymentStatus !== 'paid') {
      throw new BadRequestException('Invoice is not yet paid');
    }

    const items = inv.items as Array<{
      name: string;
      hsn: string;
      qty: number;
      uom: string;
      rate: number;
      amount: number;
    }>;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ── Header ────────────────────────────────────────────────────────────
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('TAX INVOICE', { align: 'center' });
      doc.moveDown(0.5);

      // Horizontal rule
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);

      // ── Supplier + Invoice meta (two-column) ─────────────────────────────
      const leftX = 50;
      const rightX = 310;
      const topY = doc.y;

      doc.font('Helvetica-Bold').fontSize(11).text('Supplier', leftX, topY);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(inv.supplierName, leftX, topY + 16)
        .text(`GSTIN: ${inv.supplierGstin}`, leftX)
        .text(inv.supplierAddress, leftX)
        .text(`Ph: ${inv.supplierPhone}`, leftX);

      doc.font('Helvetica-Bold').fontSize(11).text('Invoice Details', rightX, topY);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(`Invoice No: ${inv.invoiceNumber}`, rightX, topY + 16)
        .text(`Date: ${inv.invoiceDate}`, rightX)
        .text(`Place of Supply: ${inv.placeOfSupply}`, rightX)
        .text(`Payment Terms: ${inv.paymentTerms}`, rightX);

      doc.moveDown(3);

      // ── Payment info ─────────────────────────────────────────────────────
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Payment Info', leftX);
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`Razorpay Order ID  : ${inv.razorpayOrderId}`, leftX)
        .text(`Razorpay Payment ID: ${inv.razorpayPaymentId ?? 'N/A'}`, leftX)
        .text(`Payment Status     : ${inv.paymentStatus.toUpperCase()}`, leftX);
      doc.moveDown(1);

      // ── Items table ───────────────────────────────────────────────────────
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.3);

      const cols = { no: 50, name: 75, hsn: 240, qty: 295, uom: 330, rate: 375, amount: 455 };

      // Table header
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('#', cols.no, doc.y, { width: 22 });
      doc.text('Item / Description', cols.name, doc.y - doc.currentLineHeight(), { width: 160 });
      doc.text('HSN', cols.hsn, doc.y - doc.currentLineHeight(), { width: 50 });
      doc.text('Qty', cols.qty, doc.y - doc.currentLineHeight(), { width: 32 });
      doc.text('UOM', cols.uom, doc.y - doc.currentLineHeight(), { width: 40 });
      doc.text('Rate', cols.rate, doc.y - doc.currentLineHeight(), { width: 75 });
      doc.text('Amount', cols.amount, doc.y - doc.currentLineHeight(), { width: 90 });
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#aaaaaa').stroke();
      doc.moveDown(0.3);

      // Table rows
      doc.font('Helvetica').fontSize(9);
      items.forEach((item, i) => {
        const rowY = doc.y;
        doc.text(String(i + 1), cols.no, rowY, { width: 22 });
        doc.text(item.name, cols.name, rowY, { width: 160 });
        doc.text(item.hsn, cols.hsn, rowY, { width: 50 });
        doc.text(String(item.qty), cols.qty, rowY, { width: 32 });
        doc.text(item.uom, cols.uom, rowY, { width: 40 });
        doc.text(item.rate.toFixed(2), cols.rate, rowY, { width: 75 });
        doc.text(item.amount.toFixed(2), cols.amount, rowY, { width: 90 });
        doc.moveDown(0.5);
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);

      // ── Totals ────────────────────────────────────────────────────────────
      const totX = 350;
      const valX = 455;

      const totalRow = (label: string, value: number) => {
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).text(label, totX, y, { width: 100 });
        doc.text(`₹ ${value.toFixed(2)}`, valX, y, { width: 90, align: 'right' });
        doc.moveDown(0.4);
      };

      totalRow('Sub Total', inv.subTotal);
      if (inv.cgst > 0) totalRow('CGST', inv.cgst);
      if (inv.sgst > 0) totalRow('SGST', inv.sgst);
      if (inv.igst > 0) totalRow('IGST', inv.igst);

      doc.moveTo(totX, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.3);
      const grandY = doc.y;
      doc.font('Helvetica-Bold').fontSize(11).text('Grand Total', totX, grandY, { width: 100 });
      doc.text(`₹ ${inv.grandTotal.toFixed(2)}`, valX, grandY, { width: 90, align: 'right' });

      // ── Footer ────────────────────────────────────────────────────────────
      doc.moveDown(2);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#888888')
        .text('This is a computer-generated invoice.', { align: 'center' });

      doc.end();
    });
  }
}
