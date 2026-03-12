import { apiFetch } from '../api';

export interface InvoiceItem {
  name: string;
  hsn: string;
  qty: number;
  uom: string;
  rate: number;
  amount: number;
}

export interface CreateInvoiceOrderPayload {
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  supplierPhone: string;
  invoiceNumber: string;
  invoiceDate: string;
  placeOfSupply: string;
  paymentTerms: string;
  items: InvoiceItem[];
  cgst: number;
  sgst: number;
  igst: number;
  subTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export interface CreateOrderResponse {
  invoiceId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentPayload {
  invoiceId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface GeneratedInvoice {
  id: string;
  userId: number;
  invoiceNumber: string;
  invoiceDate: string;
  placeOfSupply: string;
  paymentTerms: string;
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  supplierPhone: string;
  items: InvoiceItem[];
  cgst: number;
  sgst: number;
  igst: number;
  subTotal: number;
  taxTotal: number;
  grandTotal: number;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  paymentStatus: 'pending' | 'paid';
  createdAt: string;
  updatedAt: string;
}

export const createInvoiceOrder = async (
  payload: CreateInvoiceOrderPayload,
  accessToken: string,
): Promise<CreateOrderResponse> => {
  const res = await apiFetch('/generated-invoice/create-order', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to create invoice order');
  }
  return res.json();
};

export const verifyInvoicePayment = async (
  payload: VerifyPaymentPayload,
  accessToken: string,
): Promise<{ success: boolean; invoiceId: string }> => {
  const res = await apiFetch('/generated-invoice/verify-payment', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to verify payment');
  }
  return res.json();
};

export const getGeneratedInvoice = async (
  id: string,
  accessToken: string,
): Promise<GeneratedInvoice> => {
  const res = await apiFetch(`/generated-invoice/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) throw new Error('Failed to fetch invoice');
  return res.json();
};

export const listGeneratedInvoices = async (
  accessToken: string,
): Promise<GeneratedInvoice[]> => {
  const res = await apiFetch('/generated-invoice', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) throw new Error('Failed to list invoices');
  return res.json();
};

/** Download PDF – fetches with auth header and triggers browser download */
export const downloadInvoicePdf = async (
  id: string,
  accessToken: string,
): Promise<void> => {
  const res = await apiFetch(`/generated-invoice/${id}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) throw new Error('Failed to download PDF');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
