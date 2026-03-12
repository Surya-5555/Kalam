"use client";

import { SectionCard } from "./section-card";
import { InfoField, FieldDivider } from "./info-field";
import type {
  NormalizedSupplier,
  NormalizedBuyer,
} from "@/lib/api/invoice";

type PartyData = NormalizedSupplier | NormalizedBuyer;

function GstinBadge({
  normalized,
  isFormatValid,
  isChecksumValid,
}: {
  normalized: string | null;
  isFormatValid: boolean;
  isChecksumValid: boolean;
}) {
  if (!normalized) return <span className="text-slate-300 italic font-normal text-sm">—</span>;

  const valid = isFormatValid && isChecksumValid;
  const partiallyValid = isFormatValid && !isChecksumValid;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-sm text-slate-800 font-medium">{normalized}</span>
      {valid && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
          Valid
        </span>
      )}
      {partiallyValid && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 leading-none">
          Checksum fail
        </span>
      )}
      {!isFormatValid && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 leading-none">
          Invalid
        </span>
      )}
    </span>
  );
}

function addressLine(party: PartyData): string | null {
  const parts = [
    party.address,
    party.city,
    party.state.normalized ?? party.state.raw,
    party.postalCode,
    party.country,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

interface PartySectionProps {
  title: string;
  data: PartyData;
}

export function PartySection({ title, data }: PartySectionProps) {
  const website = "website" in data ? (data as NormalizedSupplier).website : null;

  return (
    <SectionCard title={title}>
      <div className="space-y-3">
        <InfoField label="Name" value={data.name} />
        <InfoField label="Address" value={addressLine(data)} />

        {(data.state.isoCode || data.state.gstCode) && (
          <div className="flex gap-4">
            {data.state.isoCode && (
              <InfoField label="ISO Code" value={data.state.isoCode} mono />
            )}
            {data.state.gstCode && (
              <InfoField label="GST State Code" value={data.state.gstCode} mono />
            )}
          </div>
        )}

        <FieldDivider />

        <InfoField
          label="GSTIN"
          value={
            <GstinBadge
              normalized={data.gstin.normalized}
              isFormatValid={data.gstin.isFormatValid}
              isChecksumValid={data.gstin.isChecksumValid}
            />
          }
        />

        {data.gstin.panSegment && (
          <div className="flex gap-4">
            <InfoField label="PAN" value={data.gstin.panSegment} mono />
            {data.gstin.entityCode && (
              <InfoField label="Entity Code" value={data.gstin.entityCode} mono />
            )}
          </div>
        )}

        <FieldDivider />

        <div className="grid grid-cols-2 gap-3">
          <InfoField label="Phone" value={data.phone} />
          <InfoField label="Email" value={data.email} />
          {website !== undefined && (
            <InfoField label="Website" value={website} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}
