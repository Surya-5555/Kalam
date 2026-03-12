"use client";

import { useState } from "react";
import { SectionCard } from "./section-card";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RawJsonSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export function RawJsonSection({ data }: RawJsonSectionProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonStr = JSON.stringify(data, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  const badge = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
    >
      {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {open ? "Collapse" : "Expand"}
    </button>
  );

  return (
    <SectionCard title="Raw Extraction Data" badge={badge}>
      {!open && (
        <button
          type="button"
          className="w-full text-left text-sm text-slate-500 py-1 hover:text-slate-700 transition-colors"
          onClick={() => setOpen(true)}
        >
          Click to expand raw JSON output from the AI extraction pipeline…
        </button>
      )}

      {open && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
          <div className="bg-slate-950 rounded-xl overflow-auto max-h-150 p-4">
            <pre className="text-xs text-slate-200 font-mono leading-relaxed whitespace-pre">
              {jsonStr}
            </pre>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
