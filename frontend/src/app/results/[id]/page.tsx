"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getInvoiceResults,
  InvoiceDocument,
  NormalizedInvoice,
} from "@/lib/api/invoice";

// ─── Actual shape stored in InvoiceDocument.extractedData ────────────────────
// The backend persists a PipelineRunResult (not AiExtractionResult) as JSON.
// This interface mirrors the fields we actually read.

interface StoredMetadata {
  extractionMethod: string | null;
  extractionModel: string | null;
  overallConfidence: number;
  sourceTextLength: number;
  schemaRepairs: Array<{ field: string; severity: string; detail: string }>;
}

interface StoredValidation {
  isValid: boolean;
  errors: Array<{ code: string; severity: string; field: string | null; message: string; expected?: string; actual?: string }>;
  warnings: Array<{ code: string; severity: string; field: string | null; message: string }>;
  rulesRun: number;
  rulesPassed: number;
}

interface StoredPipelineResult {
  status: "completed" | "partial" | "failed";
  invoice: NormalizedInvoice | null;
  validation: StoredValidation | null;
  warnings: Array<{ code: string; message: string; field?: string | null; details?: string | null }>;
  metadata: StoredMetadata | null;
}

import { PartySection } from "@/components/invoice-results/party-section";
import { HeaderSection } from "@/components/invoice-results/header-section";
import { ItemsTable } from "@/components/invoice-results/items-table";
import { TaxSection } from "@/components/invoice-results/tax-section";
import { TotalsSection } from "@/components/invoice-results/totals-section";
import { ValidationSection } from "@/components/invoice-results/validation-section";
import { RawJsonSection } from "@/components/invoice-results/raw-json-section";
import { SectionCard } from "@/components/invoice-results/section-card";
import { ExportActions } from "@/components/invoice-results/export-actions";
import { WarningsPanel } from "@/components/invoice-results/warnings-panel";

// Skip SSR for the PDF/image preview — it relies on browser APIs (Blob,
// ResizeObserver, PDF.js worker) that do not exist on the server.
const InvoicePreviewPanel = dynamic(
  () =>
    import("@/components/invoice-results/invoice-preview-panel").then(
      (m) => m.InvoicePreviewPanel,
    ),
  { ssr: false },
);

// ── Left panel: document metadata card ───────────────────────────────────────

function DocumentMetaCard({ doc }: { doc: InvoiceDocument }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-slate-100 rounded-xl shrink-0">
          <FileText className="w-5 h-5 text-slate-600" />
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-semibold text-slate-900 break-all leading-tight"
            title={doc.originalName}
          >
            {doc.originalName}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {(doc.fileSize / 1024).toFixed(1)} KB &middot; {doc.mimeType}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">Status</span>
        <StatusBadge status={doc.status} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">Uploaded</span>
        <span className="text-xs text-slate-700 font-mono">
          {new Date(doc.uploadedAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">Last updated</span>
        <span className="text-xs text-slate-700 font-mono">
          {new Date(doc.updatedAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

// ── Left panel: extraction quality card ──────────────────────────────────────

function ExtractionQualityCard({ data }: { data: StoredPipelineResult }) {
  const pct = Math.round((data.metadata?.overallConfidence ?? 0) * 100);
  const color =
    pct >= 85
      ? "text-emerald-600"
      : pct >= 60
        ? "text-amber-600"
        : "text-rose-600";
  const barColor =
    pct >= 85
      ? "bg-emerald-500"
      : pct >= 60
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        Extraction Quality
      </p>

      <div className="flex items-end justify-between">
        <span className={`text-3xl font-bold tabular-nums ${color}`}>
          {pct}%
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            data.status === "completed"
              ? "bg-emerald-100 text-emerald-700"
              : data.status === "partial"
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700"
          }`}
        >
          {data.status === "completed" ? "success" : data.status}
        </span>
      </div>

      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Model</span>
          <span className="text-slate-700 font-mono text-[11px]">
            {data.metadata?.extractionModel ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Source method</span>
          <span className="text-slate-700 font-mono text-[11px]">
            {data.metadata?.extractionMethod ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Source chars</span>
          <span className="text-slate-700 font-mono text-[11px]">
            {(data.metadata?.sourceTextLength ?? 0).toLocaleString()}
          </span>
        </div>
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1">
          {data.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-[11px] text-amber-700 flex gap-1">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              {w.message}
            </p>
          ))}
          {data.warnings.length > 3 && (
            <p className="text-[11px] text-slate-400">
              +{data.warnings.length - 3} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Left panel: invoice summary card (light theme) ───────────────────────────

function InvoiceSummaryCard({ inv }: { inv: NormalizedInvoice }) {
  const h = inv.invoice;
  const currency = h.currency;

  function fmt(v: number | null): string {
    if (v == null) return "—";
    try {
      if (currency) {
        return new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
        }).format(v);
      }
    } catch {
      // fall through
    }
    return v.toLocaleString("en-IN");
  }

  const amountLabel =
    inv.totals.amountDue != null ? "Amount Due" : "Grand Total";
  const amountValue = inv.totals.amountDue ?? inv.totals.grandTotal;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        Invoice
      </p>

      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-slate-900 truncate">
          {h.number ?? "—"}
        </p>
        {h.date.normalized && (
          <p className="text-xs text-slate-400 shrink-0">
            {new Date(h.date.normalized).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      <div className="pt-2 space-y-2 border-t border-slate-100">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            From
          </p>
          <p className="text-xs font-semibold text-slate-900 truncate">
            {inv.supplier.name ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            To
          </p>
          <p className="text-xs font-semibold text-slate-900 truncate">
            {inv.buyer.name ?? "—"}
          </p>
        </div>
      </div>

      {amountValue != null && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            {amountLabel}
          </p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {fmt(amountValue)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Schema repairs card ───────────────────────────────────────────────────────

function SchemaRepairsCard({ data }: { data: StoredPipelineResult }) {
  const repairs = (data.metadata?.schemaRepairs ?? []).filter((r) => r.severity !== "coerced");
  if (repairs.length === 0) return null;

  return (
    <SectionCard
      title="Schema Repairs"
      badge={
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
          {repairs.length}
        </span>
      }
    >
      <div className="space-y-1.5">
        {repairs.map((r, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="font-mono text-slate-600 shrink-0">{r.field}</span>
            <span className="text-slate-400">—</span>
            <span className="text-amber-700">{r.detail}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── No data state ─────────────────────────────────────────────────────────────

function NoDataState({ doc }: { doc: InvoiceDocument }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="p-4 bg-slate-100 rounded-full mb-4">
        <FileText className="w-10 h-10 text-slate-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">
        No extraction data available
      </h2>
      <p className="text-sm text-slate-500 max-w-sm mb-6">
        {doc.status === "processing"
          ? "This invoice is still being processed. Check back soon."
          : doc.status === "failed"
            ? "Processing failed for this invoice. No data could be extracted."
            : "No extracted data was found for this invoice."}
      </p>
      <Button variant="outline" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>
    </div>
  );
}

// ── Main Results Page ─────────────────────────────────────────────────────────

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<InvoiceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await getInvoiceResults(id);
        setDoc(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center">
            <div className="w-32 h-5 bg-slate-100 rounded animate-pulse" />
          </div>
        </nav>
        <main className="pt-28 pb-16 px-6 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[360px_1fr] gap-6">
            <div className="space-y-4">
              {[100, 140, 220].map((h) => (
                <div
                  key={h}
                  className="bg-white border border-slate-200 rounded-2xl animate-pulse"
                  style={{ height: h }}
                />
              ))}
            </div>
            <div className="space-y-4">
              {[80, 180, 300, 240, 100].map((h, i) => (
                <div
                  key={i}
                  className="bg-white border border-slate-200 rounded-2xl animate-pulse"
                  style={{ height: h }}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <p className="text-slate-700 font-medium">
            {error ?? "Invoice not found"}
          </p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const extracted = doc.extractedData as StoredPipelineResult | null;
  const inv: NormalizedInvoice | null = extracted?.invoice ?? null;
  const currency = inv?.invoice.currency ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 font-bold text-xl text-slate-900 cursor-pointer"
            onClick={() => router.push("/")}
          >
            <span>Automator</span>
          </div>
          <Button
            variant="ghost"
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="size-4 mr-2" />
            Dashboard
          </Button>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-6 max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Invoice Results
              </p>
              <h1
                className="truncate text-2xl font-bold text-slate-900"
                title={doc.originalName}
              >
                {doc.originalName}
              </h1>
            </div>
            <div className="shrink-0 pt-1">
              <StatusBadge status={doc.status} />
            </div>
          </div>

          {extracted && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Zap className="h-3.5 w-3.5" />
                  {Math.round((extracted.metadata?.overallConfidence ?? 0) * 100)}% confidence
                </span>
                {extracted.validation && (
                  <span
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      extracted.validation.isValid
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {extracted.validation.isValid ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    {extracted.validation.isValid
                      ? "Passed validation"
                      : `${extracted.validation.errors.length} validation issue${
                          extracted.validation.errors.length !== 1 ? "s" : ""
                        }`}
                  </span>
                )}
              </div>
              {inv && (
                <ExportActions
                  normalizedInvoice={inv}
                  businessValidation={extracted.validation as any}
                  originalName={doc.originalName}
                />
              )}
            </div>
          )}
        </div>

        {/* Two-column layout */}
        {!extracted && <NoDataState doc={doc} />}

        {extracted && (
          <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
            {/* ── Left column (sticky, independently scrollable) ─────── */}
            <div className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-2">
              <InvoicePreviewPanel
                documentId={doc.id}
                mimeType={doc.mimeType}
              />
              <DocumentMetaCard doc={doc} />
              {inv && <InvoiceSummaryCard inv={inv} />}
              <ExtractionQualityCard data={extracted} />
              {(extracted.metadata?.schemaRepairs ?? []).length > 0 && (
                <SchemaRepairsCard data={extracted} />
              )}
            </div>

            {/* ── Right column (scrollable) ────────────────────────────── */}
            <div className="space-y-4 min-w-0">
              {inv ? (
                <>
                  {/* Parties */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <PartySection title="Supplier" data={inv.supplier} />
                    <PartySection title="Bill To" data={inv.buyer} />
                  </div>

                  {/* Header */}
                  <HeaderSection data={inv.invoice} />

                  {/* Items */}
                  {inv.items.length > 0 && (
                    <ItemsTable items={inv.items} currency={currency} />
                  )}

                  {/* Tax */}
                  {(inv.tax.breakdown.length > 0 ||
                    inv.tax.totalTaxAmount != null) && (
                    <TaxSection tax={inv.tax} currency={currency} />
                  )}

                  {/* Totals */}
                  <TotalsSection totals={inv.totals} currency={currency} />

                  {/* Validation */}
                  {extracted.validation && (
                    <ValidationSection
                      validation={extracted.validation as any}
                    />
                  )}

                  {/* Pipeline warnings */}
                  {extracted.warnings.length > 0 && (
                    <WarningsPanel warnings={extracted.warnings as any} />
                  )}

                  {/* Raw JSON */}
                  <RawJsonSection data={extracted} />
                </>
              ) : (
                <>
                  {/* No normalizedInvoice — show validation + warnings + raw only */}
                  {extracted.validation && (
                    <ValidationSection
                      validation={extracted.validation as any}
                    />
                  )}
                  {extracted.warnings.length > 0 && (
                    <WarningsPanel warnings={extracted.warnings as any} />
                  )}
                  <RawJsonSection data={extracted} />
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
