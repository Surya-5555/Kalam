import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  badge,
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-2xl overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {title}
          </h3>
          {badge}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
