"use client";

import { AlertTriangle, Info, Copy, Fingerprint, Eye, Clock, FileX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineWarning, PipelineWarningCode } from "@/lib/api/invoice";

interface WarningsPanelProps {
  warnings: PipelineWarning[];
}

// ─── Icon + colour per warning code ──────────────────────────────────────────

type WarningMeta = {
  Icon: React.ElementType;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
};

function getWarningMeta(code: PipelineWarningCode): WarningMeta {
  // Duplicate warnings — violet
  if (code === "DUPLICATE_DETECTED" || code === "DUPLICATE_POSSIBLE") {
    return {
      Icon: Fingerprint,
      bg: "bg-violet-50",
      text: "text-violet-800",
      border: "border-violet-100",
      badgeBg: "bg-violet-100",
      badgeText: "text-violet-700",
    };
  }
  // Financial integrity — rose
  if (code === "TOTALS_MISMATCH" || code === "LINE_ITEM_TOTAL_MISMATCH") {
    return {
      Icon: AlertTriangle,
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-100",
      badgeBg: "bg-rose-100",
      badgeText: "text-rose-700",
    };
  }
  // OCR quality — amber
  if (code === "OCR_LOW_CONFIDENCE" || code === "OCR_PARTIAL_FAILURE") {
    return {
      Icon: Eye,
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-100",
      badgeBg: "bg-amber-100",
      badgeText: "text-amber-700",
    };
  }
  // Missing fields — slate
  if (
    code === "MISSING_INVOICE_NUMBER" ||
    code === "MISSING_INVOICE_DATE" ||
    code === "MISSING_SUPPLIER_GSTIN"
  ) {
    return {
      Icon: FileX,
      bg: "bg-slate-50",
      text: "text-slate-700",
      border: "border-slate-200",
      badgeBg: "bg-slate-100",
      badgeText: "text-slate-600",
    };
  }
  // Payment terms — slate
  if (code === "UNCLEAR_PAYMENT_TERMS") {
    return {
      Icon: Clock,
      bg: "bg-slate-50",
      text: "text-slate-700",
      border: "border-slate-200",
      badgeBg: "bg-slate-100",
      badgeText: "text-slate-600",
    };
  }
  // Schema / extraction — amber (default)
  return {
    Icon: Info,
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-100",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WarningsPanel({ warnings }: WarningsPanelProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Pipeline Warnings
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 border border-amber-200">
          {warnings.length}
        </span>
      </div>

      {/* Warning list */}
      <div className="divide-y divide-slate-100">
        {warnings.map((w, i) => {
          const meta = getWarningMeta(w.code);
          const { Icon } = meta;
          return (
            <div
              key={i}
              className={cn("flex gap-3 px-4 py-3", meta.bg)}
            >
              {/* Icon */}
              <div className="shrink-0 pt-0.5">
                <Icon className={cn("h-4 w-4", meta.text)} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Code badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
                      meta.badgeBg,
                      meta.badgeText,
                    )}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    {w.code}
                  </span>

                  {/* Field badge */}
                  {w.field && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                      {w.field}
                    </span>
                  )}
                </div>

                {/* Message */}
                <p className={cn("text-xs leading-relaxed", meta.text)}>
                  {w.message}
                </p>

                {/* Details */}
                {w.details && (
                  <p className="font-mono text-[10px] text-slate-400">
                    {w.details}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
