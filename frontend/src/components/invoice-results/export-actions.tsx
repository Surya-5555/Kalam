"use client";

import { useState } from "react";
import { Copy, Check, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NormalizedInvoice, BusinessValidationResult } from "@/lib/api/invoice";
import {
  buildExportJson,
  buildExportFilename,
  copyJsonToClipboard,
  downloadJsonFile,
} from "@/lib/export-json";

interface ExportActionsProps {
  normalizedInvoice: NormalizedInvoice;
  businessValidation: BusinessValidationResult | null;
  /** Original file name, used to derive the download filename. */
  originalName: string;
}

type CopyState = "idle" | "copied" | "error";

export function ExportActions({
  normalizedInvoice,
  businessValidation,
  originalName,
}: ExportActionsProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const json = buildExportJson({ normalizedInvoice, businessValidation });
  const filename = buildExportFilename(originalName);

  async function handleCopy() {
    try {
      await copyJsonToClipboard(json);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  }

  function handleDownload() {
    downloadJsonFile(json, filename);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Copy button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className={`h-8 gap-1.5 rounded-lg text-xs font-medium transition-colors ${
          copyState === "copied"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
            : copyState === "error"
              ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-50"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
        }`}
      >
        {copyState === "copied" ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Copied!
          </>
        ) : copyState === "error" ? (
          <>
            <AlertCircle className="h-3.5 w-3.5" />
            Failed
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy JSON
          </>
        )}
      </Button>

      {/* Download button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
      >
        <Download className="h-3.5 w-3.5" />
        Download JSON
      </Button>
    </div>
  );
}
