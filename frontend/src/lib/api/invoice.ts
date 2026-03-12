import { apiFetch } from '../api';

export interface InvoiceDocument {
  id: string;
  userId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  status: 'pending' | 'needs_review' | 'processing' | 'completed' | 'failed';
  extractedData: any | null;
  uploadedAt: string;
  updatedAt: string;
}

export type InspectionFileType = 'pdf' | 'jpeg' | 'png' | 'unknown';
export type InspectionNextStep = 'proceed' | 'manual_review' | 'reject';

export interface InspectionResult {
  isValid: boolean;
  fileType: InspectionFileType;
  isPasswordProtected: boolean;
  isCorrupted: boolean;
  qualityWarnings: string[];
  nextRecommendedStep: InspectionNextStep;
}

export interface UploadResponse {
  success: boolean;
  documentId: string;
  message: string;
}

export type DocumentType = 'text-based-pdf' | 'scanned-pdf' | 'image-document';
export type ExtractionMethod = 'native-text-extraction' | 'ocr' | 'image-ocr';

export interface DocumentTypeResult {
  documentType: DocumentType;
  detectionReason: string;
  extractionMethod: ExtractionMethod;
  extractedTextLength: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface TextExtractionResult {
  fullText: string;
  pages: PageText[];
  totalPages: number;
  extractedCharacterCount: number;
  extractionMethod: 'native-text-extraction';
  hadPartialFailure: boolean;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  characterCount: number;
}

export interface OcrResult {
  fullText: string;
  pages: OcrPageResult[];
  totalPages: number;
  extractedCharacterCount: number;
  averageConfidence: number;
  extractionMethod: 'ocr' | 'image-ocr';
  hadLowConfidence: boolean;
  hadPartialFailure: boolean;
}

// ─── AI Extraction types ──────────────────────────────────────────────────────

export interface SupplierDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  website: string | null;
  confidence: number;
}

export interface BuyerDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  confidence: number;
}

export interface InvoiceDetails {
  invoiceNumber: string | null;
  invoiceNumberCandidates: string[] | null;
  invoiceDate: string | null;
  dueDate: string | null;
  purchaseOrderNumber: string | null;
  currency: string | null;
  paymentTerms: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  confidence: number;
}

export interface LineItem {
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  confidence: number;
}

export interface TaxBreakdown {
  taxType: string | null;
  taxRate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: number;
}

export interface InvoiceTotals {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  confidence: number;
}

export interface ExtractedInvoice {
  supplier: SupplierDetails;
  buyer: BuyerDetails;
  invoice: InvoiceDetails;
  lineItems: LineItem[];
  taxBreakdown: TaxBreakdown[];
  totals: InvoiceTotals;
}

export type AiExtractionStatus = 'success' | 'partial' | 'failed';

// ─── Canonical invoice schema (stable output contract) ────────────────────────

export interface CanonicalSupplier {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  website: string | null;
  confidence: number;
}

export interface CanonicalBuyer {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  confidence: number;
}

export interface CanonicalInvoiceHeader {
  number: string | null;
  numberCandidates: string[] | null;
  date: string | null;
  dueDate: string | null;
  purchaseOrderNumber: string | null;
  currency: string | null;
  paymentTerms: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  confidence: number;
}

export interface CanonicalLineItem {
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  confidence: number;
}

export interface CanonicalTaxEntry {
  type: string | null;
  rate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: number;
}

export interface CanonicalTax {
  breakdown: CanonicalTaxEntry[];
  totalTaxAmount: number | null;
}

export interface CanonicalTotals {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  confidence: number;
}

export interface CanonicalInvoice {
  schemaVersion: 1;
  supplier: CanonicalSupplier;
  buyer: CanonicalBuyer;
  invoice: CanonicalInvoiceHeader;
  items: CanonicalLineItem[];
  tax: CanonicalTax;
  totals: CanonicalTotals;
}

export type RepairSeverity = 'coerced' | 'nulled' | 'defaulted';

export interface SchemaRepairRecord {
  field: string;
  severity: RepairSeverity;
  detail: string;
}

// ─── Normalized invoice types ────────────────────────────────────────────────

export interface NormalizedDate {
  raw: string | null;
  normalized: string | null;
  machineReadableValue: number | null;
  daysFromToday: number | null;
  confidence: number;
}

export interface NormalizedPaymentTerms {
  raw: string | null;
  normalized: string | null;
  days: number | null;
  isEarlyPaymentDiscount: boolean;
  earlyPaymentDays: number | null;
  earlyPaymentDiscountPct: number | null;
  confidence: number;
}

export interface NormalizedState {
  raw: string | null;
  normalized: string | null;
  isoCode: string | null;
  gstCode: string | null;
  confidence: number;
}

export interface NormalizedGstin {
  raw: string | null;
  normalized: string | null;
  isFormatValid: boolean;
  isChecksumValid: boolean;
  stateCode: string | null;
  panSegment: string | null;
  entityCode: string | null;
  confidence: number;
}

export type GstComponent = 'CGST' | 'SGST' | 'UTGST' | 'IGST' | 'CESS' | 'VAT' | 'TDS' | 'TCS' | 'OTHER';
export type TaxRegime    = 'GST' | 'VAT' | 'MIXED' | 'UNKNOWN';

export interface NormalizedSupplier {
  name: string | null;
  address: string | null;
  city: string | null;
  state: NormalizedState;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  gstin: NormalizedGstin;
  website: string | null;
  confidence: number;
}

export interface NormalizedBuyer {
  name: string | null;
  address: string | null;
  city: string | null;
  state: NormalizedState;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  gstin: NormalizedGstin;
  confidence: number;
}

export interface NormalizedInvoiceHeader {
  number: string | null;
  date: NormalizedDate;
  dueDate: NormalizedDate;
  currency: string | null;
  paymentTerms: NormalizedPaymentTerms;
  purchaseOrderNumber: string | null;
  placeOfSupply: NormalizedState;
  notes: string | null;
  confidence: number;
}

export interface NormalizedLineItem {
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  computedTotal: number | null;
  totalMismatch: boolean;
  confidence: number;
}

export interface NormalizedTaxEntry {
  typeRaw: string | null;
  typeNormalized: string | null;
  gstComponent: GstComponent | null;
  rate: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  confidence: number;
}

export interface NormalizedTax {
  breakdown: NormalizedTaxEntry[];
  totalTaxAmount: number | null;
  regime: TaxRegime;
}

export interface NormalizedTotals {
  subtotal: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  shippingAndHandling: number | null;
  grandTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  itemsSumTotal: number | null;
  grandTotalMismatch: boolean;
  confidence: number;
}

export interface NormalizedInvoice {
  normalizationVersion: 1;
  supplier: NormalizedSupplier;
  buyer: NormalizedBuyer;
  invoice: NormalizedInvoiceHeader;
  items: NormalizedLineItem[];
  tax: NormalizedTax;
  totals: NormalizedTotals;
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Business validation types ───────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  field: string | null;
  message: string;
  expected?: string;
  actual?: string;
}

export interface BusinessValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  allIssues: ValidationIssue[];
  rulesRun: number;
  rulesPassed: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface AiExtractionResult {
  status: AiExtractionStatus;
  extractedInvoice: ExtractedInvoice | null;
  canonicalInvoice: CanonicalInvoice | null;
  schemaRepairs: SchemaRepairRecord[];
  normalizedInvoice: NormalizedInvoice | null;
  businessValidation: BusinessValidationResult | null;
  overallConfidence: number;
  warnings: string[];
  extractionModel: string;
  extractionTimestamp: string;
  sourceTextMethod: 'native-text-extraction' | 'ocr' | 'image-ocr';
  sourceTextLength: number;
  extractionError: string | null;
}

export async function getRecentInvoices(_token: string, limit: number = 10): Promise<InvoiceDocument[]> {
  const response = await apiFetch(`/invoice/recent?limit=${limit}`);

  if (!response || !response.ok) {
    throw new Error('Failed to fetch recent invoices');
  }

  return response.json();
}

export async function getInvoiceById(id: string, _token: string): Promise<InvoiceDocument> {
  const response = await apiFetch(`/invoice/${id}`);

  if (!response || !response.ok) {
    throw new Error('Failed to fetch invoice details');
  }

  return response.json();
}

// ─── Processing status types ──────────────────────────────────────────────────

export type ProcessingStage =
  | 'uploaded'
  | 'inspection'
  | 'document_type_detection'
  | 'text_extraction'
  | 'ocr'
  | 'ai_extraction'
  | 'normalization'
  | 'validation'
  | 'completed';

export type ProcessingStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed';

export interface StageRecord {
  stage: ProcessingStage;
  status: ProcessingStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface ProcessingStatusResponse {
  id: string;
  documentId: string;
  overallStatus: 'processing' | 'completed' | 'failed';
  currentStage: ProcessingStage;
  stages: StageRecord[];
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  /** Populated (as AiExtractionResult) when overallStatus === 'completed' */
  extractedData: AiExtractionResult | null;
}

export async function getInvoiceResults(
  id: string,
): Promise<InvoiceDocument & { extractedData: AiExtractionResult | null }> {
  const doc = await getInvoiceById(id, '');
  return doc as InvoiceDocument & { extractedData: AiExtractionResult | null };
}

export async function getProcessingStatus(
  documentId: string,
): Promise<ProcessingStatusResponse> {
  const response = await apiFetch(`/invoice/${documentId}/status`);

  if (!response || !response.ok) {
    throw new Error('Failed to fetch processing status');
  }

  return response.json();
}
