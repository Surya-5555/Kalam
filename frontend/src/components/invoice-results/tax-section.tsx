"use client";

import { SectionCard } from "./section-card";
import type { NormalizedTax } from "@/lib/api/invoice";

const REGIME_STYLES: Record<string, string> = {
  GST: "bg-blue-50 text-blue-700 border-blue-200",
  VAT: "bg-purple-50 text-purple-700 border-purple-200",
  MIXED: "bg-amber-50 text-amber-700 border-amber-200",
  UNKNOWN: "bg-slate-100 text-slate-500 border-slate-200",
};

function fmt(v: number | null, currency?: string | null): string {
  if (v == null) return "—";
  try {
    if (currency) {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);
    }
  } catch {
    // fall through
  }
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

interface TaxSectionProps {
  tax: NormalizedTax;
  currency?: string | null;
}

export function TaxSection({ tax, currency }: TaxSectionProps) {
  const regimeStyle =
    REGIME_STYLES[tax.regime] ?? REGIME_STYLES.UNKNOWN;

  const badge = (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${regimeStyle}`}
    >
      {tax.regime}
    </span>
  );

  if (tax.breakdown.length === 0) {
    return (
      <SectionCard title="Tax Summary" badge={badge}>
        {tax.totalTaxAmount != null ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Total Tax</span>
            <span className="text-sm font-semibold text-slate-900">
              {fmt(tax.totalTaxAmount, currency)}
            </span>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic text-center py-2">
            No tax breakdown available
          </p>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Tax Summary" badge={badge}>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-100 text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Tax Type
              </th>
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Component
              </th>
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Rate
              </th>
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Taxable Amt
              </th>
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2">
                Tax Amt
              </th>
            </tr>
          </thead>
          <tbody>
            {tax.breakdown.map((entry, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
              >
                <td className="py-3 pr-4 text-slate-700">
                  {entry.typeNormalized ?? entry.typeRaw ?? (
                    <span className="text-slate-300 italic">—</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {entry.gstComponent ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {entry.gstComponent}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right text-slate-700 tabular-nums">
                  {entry.rate != null ? `${entry.rate}%` : "—"}
                </td>
                <td className="py-3 pr-4 text-right text-slate-700 tabular-nums">
                  {fmt(entry.taxableAmount, currency)}
                </td>
                <td className="py-3 text-right font-semibold text-slate-900 tabular-nums">
                  {fmt(entry.taxAmount, currency)}
                </td>
              </tr>
            ))}
          </tbody>
          {tax.totalTaxAmount != null && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td
                  colSpan={4}
                  className="py-2.5 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wider"
                >
                  Total Tax
                </td>
                <td className="py-2.5 text-right font-bold text-slate-900 tabular-nums">
                  {fmt(tax.totalTaxAmount, currency)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </SectionCard>
  );
}
