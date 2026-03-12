import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  name: string;

  @IsString()
  hsn: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  qty: number;

  @IsString()
  uom: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  rate: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateInvoiceOrderDto {
  @IsString()
  supplierName: string;

  @IsString()
  supplierGstin: string;

  @IsOptional()
  @IsString()
  supplierAddress?: string;

  @IsOptional()
  @IsString()
  supplierPhone?: string;

  @IsString()
  invoiceNumber: string;

  @IsDateString()
  invoiceDate: string;

  @IsString()
  placeOfSupply: string;

  @IsString()
  paymentTerms: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cgst: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sgst: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  igst: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subTotal: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxTotal: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  grandTotal: number;
}

export class VerifyPaymentDto {
  @IsString()
  invoiceId: string;

  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;
}
