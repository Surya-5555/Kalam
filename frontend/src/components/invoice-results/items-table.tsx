"use client";

import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import type { NormalizedLineItem } from "@/lib/api/invoice";

function fmt(
  v: number | null | undefined,
  currency?: string | null,
  decimals = 2,
): string {
  if (v == null) return "—";
  try {
    if (currency) {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v);
    }
  } catch {
    // fall through
  }
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtQty(qty: number | null, unit: string | null): string {
  if (qty == null) return "—";
  return unit ? `${qty} ${unit}` : String(qty);
}

function discountLabel(
  discount: number | null,
  discountType: "percentage" | "fixed" | null,
): string {
  if (discount == null) return "—";
  if (discountType === "percentage") return `${discount}%`;
  return String(discount);
}

interface ItemsTableProps {
  items: NormalizedLineItem[];
  currency?: string | null;
}

export function ItemsTable({ items, currency }: ItemsTableProps) {
  if (items.length === 0) {
    return (
      <SectionCard title="Line Items">
        <p className="text-sm text-slate-400 italic text-center py-4">
          No line items extracted
        </p>
      </SectionCard>
    );
  }

  const hasTax = items.some(
    (i) => i.taxRate != null || i.taxAmount != null,
  );
  const hasDiscount = items.some((i) => i.discount != null);

  return (
    <SectionCard
      title="Line Items"
      badge={
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      }
    >
      {/* Scrollable wrapper for mobile */}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-160 text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4 w-6">
                #
              </th>
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Description
              </th>
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Qty
              </th>
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Unit Price
              </th>
              {hasDiscount && (
                <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                  Discount
                </th>
              )}
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                Subtotal
              </th>
              {hasTax && (
                <>
                  <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                    Tax %
                  </th>
                  <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2 pr-4">
                    Tax Amt
                  </th>
                </>
              )}
              <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.lineNumber}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
              >
                <td className="py-3 pr-4 text-slate-400 text-xs tabular-nums">
                  {item.lineNumber}
                </td>
                <td className="py-3 pr-4 text-slate-800 max-w-xs">
                  <p className="leading-snug">
                    {item.description ?? (
                      <span className="text-slate-300 italic">—</span>
                    )}
                  </p>
                </td>
                <td className="py-3 pr-4 text-right text-slate-700 tabular-nums whitespace-nowrap">
                  {fmtQty(item.quantity, item.unit)}
                </td>
                <td className="py-3 pr-4 text-right text-slate-700 tabular-nums whitespace-nowrap">
                  {fmt(item.unitPrice, currency)}
                </td>
                {hasDiscount && (
                  <td className="py-3 pr-4 text-right text-slate-600 tabular-nums whitespace-nowrap">
                    {discountLabel(item.discount, item.discountType)}
                  </td>
                )}
                <td className="py-3 pr-4 text-right text-slate-700 tabular-nums whitespace-nowrap">
                  {fmt(item.subtotal, currency)}
                </td>
                {hasTax && (
                  <>
                    <td className="py-3 pr-4 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {item.taxRate != null ? `${item.taxRate}%` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {fmt(item.taxAmount, currency)}
                    </td>
                  </>
                )}
                <td
                  className={cn(
                    "py-3 text-right font-semibold tabular-nums whitespace-nowrap",
                    item.totalMismatch
                      ? "text-amber-700 bg-amber-50 rounded px-2"
                      : "text-slate-900",
                  )}
                >
                  {fmt(item.total, currency)}
                  {item.totalMismatch && item.computedTotal != null && (
                    <p className="text-[10px] font-normal text-amber-600 mt-0.5">
                      expected {fmt(item.computedTotal, currency)}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
