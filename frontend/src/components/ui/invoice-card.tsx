import { FileText, Calendar, HardDrive } from "lucide-react";
import { InvoiceDocument } from "@/lib/api/invoice";
import { StatusBadge } from "./status-badge";

interface InvoiceCardProps {
  invoice: InvoiceDocument;
  onClick?: () => void;
}

export function InvoiceCard({ invoice, onClick }: InvoiceCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(dateString));
  };

  return (
    <div 
      onClick={onClick}
      className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-slate-100 text-slate-900 rounded-xl group-hover:bg-black group-hover:text-white transition-colors">
          <FileText className="w-6 h-6" />
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <h3 className="font-semibold text-slate-900 truncate mb-4" title={invoice.originalName}>
        {invoice.originalName}
      </h3>

      <div className="space-y-2">
        <div className="flex items-center text-xs font-medium text-slate-500">
          <Calendar className="w-3.5 h-3.5 mr-2" />
          {formatDate(invoice.uploadedAt)}
        </div>
        <div className="flex items-center text-xs font-medium text-slate-500">
          <HardDrive className="w-3.5 h-3.5 mr-2" />
          {formatFileSize(invoice.fileSize)}
        </div>
      </div>
    </div>
  );
}
