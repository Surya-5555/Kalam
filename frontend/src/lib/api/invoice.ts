import { apiFetch } from '../api';

export interface InvoiceDocument {
  id: string;
  userId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extractedData: any | null;
  uploadedAt: string;
  updatedAt: string;
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
