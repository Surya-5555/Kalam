"use client";

import { SectionCard } from "./section-card";
import { InfoField, FieldDivider } from "./info-field";
import type { NormalizedInvoiceHeader } from "@/lib/api/invoice";

function formatNormalizedDate(
  nd: NormalizedInvoiceHeader["date"] | NormalizedInvoiceHeader["dueDate"],
  daysLabel?: string,
): string | null {
  const base = nd.normalized ?? nd.raw;
  if (!base) return null;
  // If it's an ISO date (YYYY-MM-DD), format it nicely
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base);
  if (match) {
    const d = new Date(`${base}T00:00:00`);
    const formatted = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    if (daysLabel && nd.daysFromToday != null) {
      return `${formatted}  (${nd.daysFromToday > 0 ? "+" : ""}${nd.daysFromToday}d)`;
    }
    return formatted;
  }
  return base;
}

interface HeaderSectionProps {
  data: NormalizedInvoiceHeader;
}

export function HeaderSection({ data }: HeaderSectionProps) {
  const paymentTermsDisplay = (() => {
    const pt = data.paymentTerms;
    if (!pt.normalized && !pt.raw) return null;
    const base = pt.normalized ?? pt.raw;
    if (pt.days != null) return `${base} (${pt.days} days)`;
    return base;
  })();

  return (
    <SectionCard title="Invoice Details">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <InfoField label="Invoice Number" value={data.number} mono />
        <InfoField
          label="Invoice Date"
          value={formatNormalizedDate(data.date)}
        />
        <InfoField
          label="Due Date"
          value={formatNormalizedDate(data.dueDate, "days")}
        />
        <InfoField label="Currency" value={data.currency} mono />
        <InfoField label="Payment Terms" value={paymentTermsDisplay} />
        <InfoField label="PO Number" value={data.purchaseOrderNumber} mono />
        {data.placeOfSupply.normalized && (
          <InfoField
            label="Place of Supply"
            value={
              data.placeOfSupply.gstCode
                ? `${data.placeOfSupply.normalized} (${data.placeOfSupply.gstCode})`
                : data.placeOfSupply.normalized
            }
          />
        )}
      </div>

      {data.notes && (
        <>
          <FieldDivider />
          <InfoField label="Notes" value={data.notes} />
        </>
      )}

      {data.paymentTerms.isEarlyPaymentDiscount &&
        data.paymentTerms.earlyPaymentDays != null && (
          <>
            <FieldDivider />
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Early Payment Discount
              </span>
              <span className="text-xs text-slate-600">
                {data.paymentTerms.earlyPaymentDiscountPct != null &&
                  `${data.paymentTerms.earlyPaymentDiscountPct}% off`}{" "}
                if paid within {data.paymentTerms.earlyPaymentDays} days
              </span>
            </div>
          </>
        )}
    </SectionCard>
  );
}
