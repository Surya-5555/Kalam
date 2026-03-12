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
  inspectionResult: InspectionResult;
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
