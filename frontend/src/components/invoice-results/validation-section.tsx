"use client";

import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import type { BusinessValidationResult } from "@/lib/api/invoice";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ValidationSectionProps {
  validation: BusinessValidationResult;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
        <AlertCircle className="w-2.5 h-2.5" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
      <AlertTriangle className="w-2.5 h-2.5" />
      Warning
    </span>
  );
}

function IssueLine({
  issue,
}: {
  issue: BusinessValidationResult["errors"][number];
}) {
  const isError = issue.severity === "error";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isError
          ? "bg-rose-50/60 border-rose-200"
          : "bg-amber-50/60 border-amber-200",
      )}
    >
      <div className="flex items-start gap-3">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                isError
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {issue.code}
            </span>
            {issue.field && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {issue.field}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-sm leading-snug",
              isError ? "text-rose-800" : "text-amber-800",
            )}
          >
            {issue.message}
          </p>
          {(issue.expected != null || issue.actual != null) && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {issue.expected != null && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Expected
                  </p>
                  <p className="text-xs font-mono text-slate-700 break-all">
                    {String(issue.expected)}
                  </p>
                </div>
              )}
              {issue.actual != null && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Actual
                  </p>
                  <p className="text-xs font-mono text-slate-700 break-all">
                    {String(issue.actual)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValidationSection({ validation }: ValidationSectionProps) {
  const badge = validation.isValid ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" />
      Valid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
      <AlertCircle className="w-3 h-3" />
      {validation.errors.length} issue{validation.errors.length !== 1 ? "s" : ""}
    </span>
  );

  const allIssues = [...validation.errors, ...validation.warnings];

  if (allIssues.length === 0) {
    return (
      <SectionCard title="Validation" badge={badge}>
        <div className="flex items-center gap-2 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-sm text-emerald-700">All validation checks passed.</p>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {validation.rulesPassed ?? validation.rulesRun} of {validation.rulesRun} rules passed
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Validation" badge={badge}>
      {validation.rulesRun != null && (
        <p className="text-xs text-slate-400 mb-4">
          {validation.rulesPassed ?? validation.rulesRun - validation.errors.length} of {validation.rulesRun} rules passed
        </p>
      )}
      <div className="space-y-2">
        {/* Errors first */}
        {validation.errors.map((issue, i) => (
          <IssueLine key={`e-${i}`} issue={issue} />
        ))}
        {/* Then warnings */}
        {validation.warnings.map((issue, i) => (
          <IssueLine key={`w-${i}`} issue={issue} />
        ))}
      </div>
    </SectionCard>
  );
}
