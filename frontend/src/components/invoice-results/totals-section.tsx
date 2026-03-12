"use client";

import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import type { NormalizedTotals } from "@/lib/api/invoice";

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

interface TotalsRowProps {
  label: string;
  value: number | null;
  currency?: string | null;
  /** If true renders as a separator row */
  divider?: boolean;
  className?: string;
}

function TotalsRow({ label, value, currency, className }: TotalsRowProps) {
  if (value == null) return null;
  return (
    <div className={cn("flex items-center justify-between py-1.5", className)}>
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium text-slate-800 tabular-nums">
        {fmt(value, currency)}
      </span>
    </div>
  );
}

interface TotalsSectionProps {
  totals: NormalizedTotals;
  currency?: string | null;
}

export function TotalsSection({ totals, currency }: TotalsSectionProps) {
  return (
    <SectionCard title="Totals">
      <div className="max-w-xs ml-auto space-y-0.5">
        <TotalsRow label="Subtotal" value={totals.subtotal} currency={currency} />

        {totals.totalDiscount != null && totals.totalDiscount !== 0 && (
          <TotalsRow
            label="Discount"
            value={-Math.abs(totals.totalDiscount)}
            currency={currency}
            className="text-emerald-700 [&>span]:text-emerald-700"
          />
        )}

        <TotalsRow label="Tax" value={totals.totalTax} currency={currency} />

        {totals.shippingAndHandling != null && totals.shippingAndHandling !== 0 && (
          <TotalsRow
            label="Shipping & Handling"
            value={totals.shippingAndHandling}
            currency={currency}
          />
        )}

        {/* Grand Total */}
        <div
          className={cn(
            "flex items-center justify-between mt-2 pt-2 border-t border-slate-200",
            totals.grandTotalMismatch && "bg-amber-50 rounded-lg px-3 py-2 border border-amber-200",
          )}
        >
          <span className="text-sm font-bold text-slate-900">Grand Total</span>
          <div className="text-right">
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                totals.grandTotalMismatch ? "text-amber-700" : "text-slate-900",
              )}
            >
              {fmt(totals.grandTotal, currency)}
            </span>
            {totals.grandTotalMismatch && totals.itemsSumTotal != null && (
              <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                Items sum: {fmt(totals.itemsSumTotal, currency)}
              </p>
            )}
          </div>
        </div>

        {/* Paid / Amount Due */}
        {(totals.amountPaid != null || totals.amountDue != null) && (
          <div className="pt-2 space-y-1">
            {totals.amountPaid != null && totals.amountPaid !== 0 && (
              <TotalsRow
                label="Amount Paid"
                value={totals.amountPaid}
                currency={currency}
              />
            )}
            {totals.amountDue != null && (
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-900">
                  Amount Due
                </span>
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    totals.amountDue > 0 ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {fmt(totals.amountDue, currency)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
