import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: 'pending' | 'needs_review' | 'processing' | 'completed' | 'failed';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    needs_review: "bg-orange-100 text-orange-700 border-orange-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    failed: "bg-rose-100 text-rose-700 border-rose-200",
  };

  const labels = {
    pending: "Pending",
    needs_review: "Needs Review",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
  };

  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      styles[status],
      className
    )}>
      {labels[status]}
    </span>
  );
}
