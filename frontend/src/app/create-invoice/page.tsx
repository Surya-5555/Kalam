"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  CheckCircle2,
  Loader2,
  IndianRupee,
} from "lucide-react";
import {
  createInvoiceOrder,
  verifyInvoicePayment,
  downloadInvoicePdf,
  InvoiceItem,
  GeneratedInvoice,
} from "@/lib/api/generated-invoice";
import { RoleProtected } from "@/components/auth/role-protected";

// ── Razorpay global type ───────────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: any) => { open(): void };
  }
}

const loadRazorpayScript = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) return resolve(true);
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyItem = (): InvoiceItem => ({
  name: "",
  hsn: "",
  qty: 1,
  uom: "pcs",
  rate: 0,
  amount: 0,
});

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Component ─────────────────────────────────────────────────────────────────
export default function CreateInvoicePage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [isHydrated, setIsHydrated] = useState(false);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [supplier, setSupplier] = useState({
    name: "",
    gstin: "",
    address: "",
    phone: "",
  });

  const [meta, setMeta] = useState({
    invoiceNumber: `INV-${Date.now().toString().slice(-4)}`,
    invoiceDate: new Date().toISOString().slice(0, 10),
    placeOfSupply: "Tamil Nadu",
    paymentTerms: "15 days",
  });

  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

  const [taxType, setTaxType] = useState<"intra" | "inter">("intra"); // intra → CGST+SGST, inter → IGST
  const GST_RATE = 0.18; // 18% GST

  // ── Computed totals ─────────────────────────────────────────────────────────
  const subTotal = items.reduce((s, i) => s + i.amount, 0);
  const taxableAmount = subTotal;
  const cgst = taxType === "intra" ? +(taxableAmount * (GST_RATE / 2)).toFixed(2) : 0;
  const sgst = taxType === "intra" ? +(taxableAmount * (GST_RATE / 2)).toFixed(2) : 0;
  const igst = taxType === "inter" ? +(taxableAmount * GST_RATE).toFixed(2) : 0;
  const taxTotal = cgst + sgst + igst;
  const grandTotal = +(subTotal + taxTotal).toFixed(2);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidInvoice, setPaidInvoice] = useState<GeneratedInvoice | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!accessToken) {
      router.replace("/login");
    }
  }, [accessToken, isHydrated, router]);

  // ── Item handlers ────────────────────────────────────────────────────────────
  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      // Recompute amount whenever qty or rate changes
      if (field === "qty" || field === "rate") {
        item.amount = +(Number(item.qty) * Number(item.rate)).toFixed(2);
      }
      next[index] = item;
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const hasValidSupplier = Boolean(supplier.name.trim() && supplier.gstin.trim());
  const hasValidItems =
    items.length > 0 &&
    items.every(
      (item) =>
        item.name.trim().length > 0 &&
        Number(item.qty) > 0 &&
        Number(item.rate) > 0 &&
        Number(item.amount) > 0,
    );
  const canPay = Boolean(accessToken) && hasValidSupplier && hasValidItems && grandTotal > 0;

  // ── Payment flow ─────────────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (!accessToken) return;
    setError(null);

    // Basic validation
    if (!supplier.name || !supplier.gstin) {
      setError("Supplier name and GSTIN are required.");
      return;
    }
    if (items.some((it) => !it.name || it.qty <= 0 || it.rate <= 0)) {
      setError("All items must have a name, quantity > 0, and rate > 0.");
      return;
    }
    if (grandTotal <= 0) {
      setError("Grand total must be greater than zero.");
      return;
    }

    setLoading(true);
    try {
      // 1. Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setError("Failed to load Razorpay. Check your internet connection.");
        return;
      }

      // 2. Create order on backend
      const order = await createInvoiceOrder(
        {
          supplierName: supplier.name,
          supplierGstin: supplier.gstin,
          supplierAddress: supplier.address,
          supplierPhone: supplier.phone,
          invoiceNumber: meta.invoiceNumber,
          invoiceDate: meta.invoiceDate,
          placeOfSupply: meta.placeOfSupply,
          paymentTerms: meta.paymentTerms,
          items,
          cgst,
          sgst,
          igst,
          subTotal,
          taxTotal,
          grandTotal,
        },
        accessToken,
      );

      // 3. Open Razorpay checkout
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: supplier.name || "Invoice Payment",
          description: `Invoice ${meta.invoiceNumber}`,
          order_id: order.razorpayOrderId,
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              // 4. Verify payment on backend
              await verifyInvoicePayment(
                {
                  invoiceId: order.invoiceId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
                accessToken,
              );
              // Build local representation for success screen
              setPaidInvoice({
                id: order.invoiceId,
                userId: 0,
                invoiceNumber: meta.invoiceNumber,
                invoiceDate: meta.invoiceDate,
                placeOfSupply: meta.placeOfSupply,
                paymentTerms: meta.paymentTerms,
                supplierName: supplier.name,
                supplierGstin: supplier.gstin,
                supplierAddress: supplier.address,
                supplierPhone: supplier.phone,
                items,
                cgst,
                sgst,
                igst,
                subTotal,
                taxTotal,
                grandTotal,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                paymentStatus: "paid",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          prefill: { contact: supplier.phone },
          theme: { color: "#0f172a" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled by user.")),
          },
        });
        rzp.open();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed.";
      if (msg !== "Payment cancelled by user.") setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, supplier, meta, items, cgst, sgst, igst, subTotal, taxTotal, grandTotal]);

  const handleDownload = async () => {
    if (!paidInvoice || !accessToken) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(paidInvoice.id, accessToken);
    } catch {
      setError("Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  };

  if (!isHydrated) {
    return null;
  }

  if (!accessToken) {
    return null;
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  if (paidInvoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h1 className="text-2xl font-bold text-slate-900">Payment Successful!</h1>
            <p className="text-slate-500 text-sm">
              Your invoice has been created and payment confirmed.
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* Invoice summary */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Supplier</p>
              <p className="font-semibold text-slate-800">{paidInvoice.supplierName}</p>
              <p className="text-slate-500">{paidInvoice.supplierGstin}</p>
              <p className="text-slate-500">{paidInvoice.supplierAddress}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Invoice</p>
              <p className="font-semibold text-slate-800">{paidInvoice.invoiceNumber}</p>
              <p className="text-slate-500">Dated: {paidInvoice.invoiceDate}</p>
              <p className="text-slate-500">Supply: {paidInvoice.placeOfSupply}</p>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Items</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium rounded-l-lg">Item</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">Qty</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">Rate</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium rounded-r-lg">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paidInvoice.items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2 px-3 text-slate-700">{it.name}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{it.qty} {it.uom}</td>
                    <td className="py-2 px-3 text-right text-slate-600">₹{fmt(it.rate)}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-800">₹{fmt(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Sub Total</span><span>₹{fmt(paidInvoice.subTotal)}</span></div>
            {paidInvoice.cgst > 0 && <div className="flex justify-between text-slate-600"><span>CGST</span><span>₹{fmt(paidInvoice.cgst)}</span></div>}
            {paidInvoice.sgst > 0 && <div className="flex justify-between text-slate-600"><span>SGST</span><span>₹{fmt(paidInvoice.sgst)}</span></div>}
            {paidInvoice.igst > 0 && <div className="flex justify-between text-slate-600"><span>IGST</span><span>₹{fmt(paidInvoice.igst)}</span></div>}
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2">
              <span>Grand Total</span><span>₹{fmt(paidInvoice.grandTotal)}</span>
            </div>
          </div>

          {/* Payment confirmation */}
          <div className="bg-emerald-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-emerald-800">Payment Confirmed</p>
            <p className="text-emerald-700 font-mono text-xs">Order: {paidInvoice.razorpayOrderId}</p>
            <p className="text-emerald-700 font-mono text-xs">Payment: {paidInvoice.razorpayPaymentId}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 bg-slate-900 hover:bg-slate-700 text-white rounded-xl h-12"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="flex-1 rounded-xl h-12 border-slate-200"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <RoleProtected mode="employee">
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="font-bold text-lg text-slate-900">Create Invoice</span>
        </div>
      </nav>

      <main className="pt-24 pb-20 px-6 max-w-5xl mx-auto space-y-8">
        {/* ── Supplier ──────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Supplier Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Business Name *">
              <input
                className={inputCls}
                placeholder="ABC Textiles"
                value={supplier.name}
                onChange={(e) => setSupplier((s) => ({ ...s, name: e.target.value }))}
              />
            </Field>
            <Field label="GSTIN *">
              <input
                className={inputCls}
                placeholder="33ABCDE1234F1Z5"
                value={supplier.gstin}
                onChange={(e) => setSupplier((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                maxLength={15}
              />
            </Field>
            <Field label="Address">
              <input
                className={inputCls}
                placeholder="Tiruppur, Tamil Nadu"
                value={supplier.address}
                onChange={(e) => setSupplier((s) => ({ ...s, address: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputCls}
                placeholder="9XXXXXXXXX"
                value={supplier.phone}
                onChange={(e) => setSupplier((s) => ({ ...s, phone: e.target.value }))}
              />
            </Field>
          </div>
        </section>

        {/* ── Invoice Meta ──────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Invoice Number">
              <input
                className={inputCls}
                value={meta.invoiceNumber}
                onChange={(e) => setMeta((m) => ({ ...m, invoiceNumber: e.target.value }))}
              />
            </Field>
            <Field label="Invoice Date">
              <input
                type="date"
                className={inputCls}
                value={meta.invoiceDate}
                onChange={(e) => setMeta((m) => ({ ...m, invoiceDate: e.target.value }))}
              />
            </Field>
            <Field label="Place of Supply">
              <input
                className={inputCls}
                placeholder="Tamil Nadu"
                value={meta.placeOfSupply}
                onChange={(e) => setMeta((m) => ({ ...m, placeOfSupply: e.target.value }))}
              />
            </Field>
            <Field label="Payment Terms">
              <input
                className={inputCls}
                placeholder="15 days"
                value={meta.paymentTerms}
                onChange={(e) => setMeta((m) => ({ ...m, paymentTerms: e.target.value }))}
              />
            </Field>
          </div>
          {/* Tax type toggle */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 font-medium">GST type:</span>
            <button
              type="button"
              onClick={() => setTaxType("intra")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                taxType === "intra"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Intra-state (CGST+SGST)
            </button>
            <button
              type="button"
              onClick={() => setTaxType("inter")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                taxType === "inter"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Inter-state (IGST)
            </button>
          </div>
        </section>

        {/* ── Line Items ────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Line Items</h2>

          {/* Header row */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">
            <span>Item Name</span><span>HSN</span><span>Qty</span><span>UOM</span><span>Rate (₹)</span><span />
          </div>

          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center">
              <input
                className={inputCls}
                placeholder="Cotton Fabric"
                value={item.name}
                onChange={(e) => updateItem(i, "name", e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="5208"
                value={item.hsn}
                onChange={(e) => updateItem(i, "hsn", e.target.value)}
              />
              <input
                type="number"
                min={0}
                className={inputCls}
                value={item.qty}
                onChange={(e) => updateItem(i, "qty", parseFloat(e.target.value) || 0)}
              />
              <input
                className={inputCls}
                placeholder="mtr"
                value={item.uom}
                onChange={(e) => updateItem(i, "uom", e.target.value)}
              />
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="0.00"
                value={item.rate}
                onChange={(e) => updateItem(i, "rate", parseFloat(e.target.value) || 0)}
              />
              <button
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
                className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Per-item amount display */}
          {items.map((item, i) => (
            <div key={`amt-${i}`} className="flex justify-between text-sm text-slate-500 px-1 -mt-2 border-b border-slate-50 pb-2">
              <span className="text-xs text-slate-400">{item.name || `Item ${i + 1}`}</span>
              <span className="font-medium text-slate-700">₹ {fmt(item.amount)}</span>
            </div>
          ))}

          <button
            onClick={addItem}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors py-1"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </section>

        {/* ── Totals ────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Totals</h2>
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <TotalRow label="Sub Total" value={subTotal} />
            {taxType === "intra" ? (
              <>
                <TotalRow label="CGST (9%)" value={cgst} />
                <TotalRow label="SGST (9%)" value={sgst} />
              </>
            ) : (
              <TotalRow label="IGST (18%)" value={igst} />
            )}
            <div className="flex justify-between font-bold text-base text-slate-900 border-t border-slate-200 pt-2">
              <span>Grand Total</span>
              <span>₹ {fmt(grandTotal)}</span>
            </div>
          </div>
        </section>

        {/* ── Error ─────────────────────────────────────── */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-rose-800 text-sm">
            {error}
          </div>
        )}

        {/* ── Pay Button ────────────────────────────────── */}
        <Button
          onClick={handlePay}
          disabled={loading || !canPay}
          className="w-full h-14 text-base font-semibold bg-slate-900 hover:bg-slate-700 text-white rounded-2xl shadow-lg disabled:bg-slate-300 disabled:text-slate-500 disabled:hover:bg-slate-300"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Processing…</>
          ) : (
            <><IndianRupee className="w-5 h-5 mr-2" /> Pay ₹ {fmt(grandTotal)} & Generate Invoice</>
          )}
        </Button>
      </main>
    </div>
    </RoleProtected>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
const inputCls =
  "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>₹ {fmt(value)}</span>
    </div>
  );
}
