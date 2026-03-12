import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface InfoFieldProps {
  label: string;
  value?: ReactNode | string | number | null;
  mono?: boolean;
  className?: string;
  /** Render value inline next to label */
  inline?: boolean;
}

export function InfoField({
  label,
  value,
  mono,
  className,
  inline,
}: InfoFieldProps) {
  const isEmpty =
    value == null || value === "" || (typeof value === "string" && !value.trim());

  if (inline) {
    return (
      <div className={cn("flex items-baseline gap-2 min-w-0", className)}>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
          {label}
        </span>
        <span
          className={cn(
            "text-sm font-medium leading-snug truncate",
            mono ? "font-mono text-slate-700" : "text-slate-800",
            isEmpty && "text-slate-300 italic font-normal",
          )}
        >
          {isEmpty ? "—" : value}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          "text-sm leading-snug",
          mono
            ? "font-mono text-slate-700 font-medium"
            : "text-slate-800 font-medium",
          isEmpty && "text-slate-300 italic font-normal",
        )}
      >
        {isEmpty ? "—" : value}
      </p>
    </div>
  );
}

/** A thin horizontal divider for use inside section cards */
export function FieldDivider() {
  return <div className="border-t border-slate-100 my-4" />;
}
