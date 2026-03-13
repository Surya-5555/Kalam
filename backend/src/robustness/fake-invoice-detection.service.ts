import { Injectable } from '@nestjs/common';
import type { ValidationIssue } from '../business-validation/types';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type { PipelineWarning } from '../common/pipeline-warning';

export interface FakeInvoiceDetectionResult {
  issues: ValidationIssue[];
  warnings: PipelineWarning[];
  flags: string[];
}

const SUSPICIOUS_SUPPLIER_PATTERNS = [
  /test supplier/i,
  /sample invoice/i,
  /dummy/i,
  /cash customer/i,
  /walk[- ]?in/i,
  /unknown vendor/i,
];

@Injectable()
export class FakeInvoiceDetectionService {
  detect(invoice: NormalizedInvoice): FakeInvoiceDetectionResult {
    const issues: ValidationIssue[] = [];
    const warnings: PipelineWarning[] = [];
    const flags: string[] = [];

    const supplierGstin = invoice.supplier.gstin;
    if (supplierGstin.raw && !supplierGstin.isFormatValid) {
      issues.push({
        code: 'GSTIN_INVALID_FORMAT',
        severity: 'error',
        field: 'supplier.gstin',
        message: 'Supplier GSTIN format is invalid.',
        actual: supplierGstin.raw,
      });
      warnings.push({
        code: 'GSTIN_INVALID_FORMAT',
        message: 'Supplier GSTIN format is invalid.',
        field: 'supplier.gstin',
      });
      flags.push('supplier-gstin-format');
    }

    if (supplierGstin.normalized && !supplierGstin.isChecksumValid) {
      issues.push({
        code: 'GSTIN_INVALID_CHECKSUM',
        severity: 'error',
        field: 'supplier.gstin',
        message: 'Supplier GSTIN checksum is invalid.',
        actual: supplierGstin.normalized,
      });
      warnings.push({
        code: 'GSTIN_INVALID_CHECKSUM',
        message: 'Supplier GSTIN checksum validation failed.',
        field: 'supplier.gstin',
      });
      flags.push('supplier-gstin-checksum');
    }

    if (
      supplierGstin.normalized &&
      supplierGstin.stateCode != null &&
      !/^(0[1-9]|1\d|2\d|3[0-7]|97|99)$/.test(supplierGstin.stateCode)
    ) {
      issues.push({
        code: 'GSTIN_INVALID_STATE_CODE',
        severity: 'error',
        field: 'supplier.gstin',
        message: 'Supplier GSTIN state code is invalid.',
        actual: supplierGstin.stateCode,
      });
      flags.push('supplier-gstin-state-code');
    }

    const supplierName = invoice.supplier.name ?? '';
    if (SUSPICIOUS_SUPPLIER_PATTERNS.some((pattern) => pattern.test(supplierName))) {
      warnings.push({
        code: 'SUSPICIOUS_SUPPLIER',
        message: 'Supplier name matches suspicious or placeholder patterns.',
        field: 'supplier.name',
      });
      flags.push('suspicious-supplier');
    }

    const invoiceNumber = invoice.invoice.number ?? '';
    if (invoiceNumber && !/[A-Za-z]/.test(invoiceNumber) && invoiceNumber.length < 4) {
      warnings.push({
        code: 'SUSPICIOUS_INVOICE_NUMBER',
        message: 'Invoice number format looks suspiciously weak.',
        field: 'invoice.number',
      });
      flags.push('weak-invoice-number');
    }

    const hasIgst = invoice.tax.breakdown.some((entry) => entry.gstComponent === 'IGST');
    const hasCgstOrSgst = invoice.tax.breakdown.some(
      (entry) => entry.gstComponent === 'CGST' || entry.gstComponent === 'SGST' || entry.gstComponent === 'UTGST',
    );

    if (hasIgst && hasCgstOrSgst) {
      issues.push({
        code: 'INVALID_TAX_STRUCTURE',
        severity: 'error',
        field: 'tax.breakdown',
        message: 'Invoice has both IGST and CGST/SGST tax structures, which is invalid.',
      });
      warnings.push({
        code: 'INVALID_TAX_STRUCTURE',
        message: 'Invoice has both IGST and CGST/SGST entries. Manual review recommended.',
        field: 'tax.breakdown',
      });
      flags.push('mixed-gst-structure');
    }

    if (!invoice.supplier.gstin.normalized) {
      warnings.push({
        code: 'MISSING_SUPPLIER_GSTIN',
        message: 'Supplier GSTIN is missing, which may indicate a fake or incomplete invoice.',
        field: 'supplier.gstin',
      });
      flags.push('missing-supplier-gstin');
    }

    return { issues, warnings, flags };
  }
}