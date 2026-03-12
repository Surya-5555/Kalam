"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  MinusCircle,
  Circle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getProcessingStatus,
  ProcessingStage,
  ProcessingStageStatus,
  ProcessingStatusResponse,
  StageRecord,
  AiExtractionResult,
  CanonicalInvoice,
} from "@/lib/api/invoice";

// ── Stage metadata ────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ProcessingStage, string> = {
  uploaded: "File Uploaded",
  inspection: "Document Inspection",
  document_type_detection: "Document Type Detection",
  text_extraction: "Text Extraction",
  ocr: "OCR Processing",
  ai_extraction: "AI Data Extraction",
  normalization: "Field Normalization",
  validation: "Business Validation",
  completed: "Processing Complete",
};

const STAGE_DESCRIPTIONS: Partial<Record<ProcessingStage, string>> = {
  inspection: "Checking file integrity and quality",
  document_type_detection: "Identifying PDF type or image format",
  text_extraction: "Extracting native text from PDF",
  ocr: "Running optical character recognition",
  ai_extraction: "Using Gemini AI to structure invoice fields",
  normalization: "Normalising dates, amounts and tax IDs",
  validation: "Running Indian GST business rule validation",
};

// ── Stage status icon ─────────────────────────────────────────────────────────

function StageIcon({ status }: { status: ProcessingStageStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
    case "running":
      return <Loader2 className="w-5 h-5 text-blue-500 shrink-0 animate-spin" />;
    case "failed":
      return <XCircle className="w-5 h-5 text-rose-500 shrink-0" />;
    case "skipped":
      return <MinusCircle className="w-5 h-5 text-slate-300 shrink-0" />;
    default:
      return <Circle className="w-5 h-5 text-slate-200 shrink-0" />;
  }
}

// ── Duration badge ────────────────────────────────────────────────────────────

function durationLabel(rec: StageRecord): string | null {
  if (!rec.startedAt || !rec.completedAt) return null;
  const ms =
    new Date(rec.completedAt).getTime() - new Date(rec.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Canonical invoice summary card ───────────────────────────────────────────

function InvoiceSummary({ data }: { data: AiExtractionResult }) {
  const c: CanonicalInvoice | null = data.canonicalInvoice;
  if (!c) return null;

  const fields: { label: string; value: string | number | null | undefined }[] =
    [
      { label: "Supplier", value: c.supplier.name },
      { label: "Invoice #", value: c.invoice.number },
      { label: "Invoice Date", value: c.invoice.date },
      { label: "Due Date", value: c.invoice.dueDate },
      { label: "Currency", value: c.invoice.currency },
      {
        label: "Payment Terms",
        value:
          c.invoice.paymentTermsDays != null
            ? `${c.invoice.paymentTerms ?? ""} (${c.invoice.paymentTermsDays}d)`.trim()
            : c.invoice.paymentTerms,
      },
      {
        label: "Grand Total",
        value:
          c.totals.grandTotal != null
            ? `${c.invoice.currency ?? ""} ${c.totals.grandTotal.toLocaleString()}`.trim()
            : null,
      },
      {
        label: "Amount Due",
        value:
          c.totals.amountDue != null
            ? `${c.invoice.currency ?? ""} ${c.totals.amountDue.toLocaleString()}`.trim()
            : null,
      },
      {
        label: "Total Tax",
        value:
          c.totals.totalTax != null
            ? c.totals.totalTax.toLocaleString()
            : null,
      },
    ];

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Extracted Invoice
        </p>
        <div className="flex items-center gap-2">
          {data.status === "partial" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Partial
            </span>
          )}
          {data.status === "success" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Success
            </span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            {(data.overallConfidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
            <p className="text-slate-800 font-semibold truncate">
              {value ?? (
                <span className="text-slate-300 font-normal italic">—</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Line items */}
      {c.items.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Line Items ({c.items.length})
          </p>
          <div className="space-y-1">
            {c.items.slice(0, 5).map((li) => (
              <div
                key={li.lineNumber}
                className="flex items-center justify-between text-xs text-slate-700"
              >
                <span className="truncate flex-1 mr-4">
                  {li.description ?? "—"}
                </span>
                <span className="shrink-0 text-slate-500">
                  {li.quantity != null && (
                    <>
                      {li.quantity}
                      {li.unit ? ` ${li.unit}` : ""} &times;{" "}
                    </>
                  )}
                  {li.unitPrice != null && <>{li.unitPrice.toLocaleString()}</>}
                  {li.total != null && (
                    <span className="ml-2 font-semibold text-slate-800">
                      {li.total.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {c.items.length > 5 && (
              <p className="text-xs text-slate-400 italic">
                +{c.items.length - 5} more items
              </p>
            )}
          </div>
        </div>
      )}

      {/* Schema repairs */}
      {data.schemaRepairs.filter((r) => r.severity !== "coerced").length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
            Schema Repairs
          </p>
          <ul className="space-y-0.5">
            {data.schemaRepairs
              .filter((r) => r.severity !== "coerced")
              .map((r, i) => (
                <li key={i} className="text-xs text-amber-800">
                  ⚠ <span className="font-mono">{r.field}</span>: {r.detail}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;

  const [status, setStatus] = useState<ProcessingStatusResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const poll = async () => {
    try {
      const data = await getProcessingStatus(documentId);
      setStatus(data);
      setFetchError(null);
      if (data.overallStatus !== "processing") {
        stopPolling();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch status";
      setFetchError(msg);
    }
  };

  useEffect(() => {
    poll(); // immediate first fetch
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ── Elapsed time display ───────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!status || status.overallStatus !== "processing") return;
    const start = new Date(status.startedAt).getTime();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [status]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderStageList = (stages: StageRecord[]) => (
    <ol className="space-y-3">
      {stages.map((rec, idx) => {
        const isLast = idx === stages.length - 1;
        const duration = durationLabel(rec);
        return (
          <li key={rec.stage} className="relative flex items-start gap-3">
            {/* Connector line */}
            {!isLast && (
              <span className="absolute left-2.25 top-6 h-full w-px bg-slate-100" />
            )}
            <StageIcon status={rec.status} />
            <div className="flex-1 pb-1">
              <div className="flex items-center justify-between">
                <p
                  className={`text-sm font-semibold leading-tight ${
                    rec.status === "running"
                      ? "text-blue-600"
                      : rec.status === "failed"
                        ? "text-rose-600"
                        : rec.status === "skipped"
                          ? "text-slate-400"
                          : rec.status === "completed"
                            ? "text-slate-800"
                            : "text-slate-400"
                  }`}
                >
                  {STAGE_LABELS[rec.stage]}
                </p>
                {duration && (
                  <span className="text-xs text-slate-400 shrink-0 ml-2">
                    {duration}
                  </span>
                )}
              </div>
              {rec.status === "running" && STAGE_DESCRIPTIONS[rec.stage] && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {STAGE_DESCRIPTIONS[rec.stage]}
                </p>
              )}
              {rec.failureReason && (
                <p className="text-xs text-rose-500 mt-0.5">
                  {rec.failureReason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

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

      <main className="pt-28 pb-16 px-6 max-w-2xl mx-auto relative z-10">
        {/* Error fetching status */}
        {fetchError && !status && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-900 text-sm">
            {fetchError}
          </div>
        )}

        {/* Loading skeleton */}
        {!status && !fetchError && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm animate-pulse space-y-4">
            <div className="h-6 w-48 bg-slate-100 rounded" />
            <div className="h-4 w-32 bg-slate-100 rounded" />
            <div className="space-y-3 pt-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-slate-100 shrink-0" />
                  <div className="h-4 bg-slate-100 rounded flex-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {status && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 rounded-xl shrink-0">
                  <FileText className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 leading-tight truncate max-w-xs">
                    {status.originalName}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(status.fileSize / 1024).toFixed(1)} KB &middot;{" "}
                    {status.mimeType}
                  </p>
                </div>
              </div>

              {/* Overall status badge */}
              <div className="shrink-0 ml-4">
                {status.overallStatus === "processing" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processing
                    {elapsed > 0 && ` · ${elapsed}s`}
                  </span>
                )}
                {status.overallStatus === "completed" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Complete
                  </span>
                )}
                {status.overallStatus === "failed" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle className="w-3 h-3" />
                    Failed
                  </span>
                )}
              </div>
            </div>

            {/* Stage list */}
            {renderStageList(status.stages)}

            {/* Failure summary */}
            {status.overallStatus === "failed" && (
              <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-1">
                  Processing Failed
                </p>
                <p className="text-sm text-rose-800">
                  Stopped at{" "}
                  <span className="font-semibold">
                    {STAGE_LABELS[status.currentStage]}
                  </span>
                  {status.failureReason && `: ${status.failureReason}`}
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Upload another file
                </Button>
              </div>
            )}

            {/* Success: extracted invoice summary */}
            {status.overallStatus === "completed" && status.extractedData && (
              <>
                <InvoiceSummary data={status.extractedData} />
                <div className="mt-6 flex gap-3">
                  <Button
                    className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => router.push(`/results/${documentId}`)}
                  >
                    View Full Results →
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard")}
                  >
                    Dashboard
                  </Button>
                </div>
              </>
            )}

            {/* Success: no extracted data */}
            {status.overallStatus === "completed" && !status.extractedData && (
              <div className="mt-6">
                <p className="text-sm text-slate-500">
                  Processing completed but no extracted data was returned.
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Back to Dashboard
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
