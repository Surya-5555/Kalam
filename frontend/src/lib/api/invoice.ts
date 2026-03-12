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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function getRecentInvoices(token: string, limit: number = 10): Promise<InvoiceDocument[]> {
  const response = await fetch(`${API_URL}/invoice/recent?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch recent invoices');
  }

  return response.json();
}

export async function getInvoiceById(id: string, token: string): Promise<InvoiceDocument> {
  const response = await fetch(`${API_URL}/invoice/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch invoice details');
  }

  return response.json();
}
