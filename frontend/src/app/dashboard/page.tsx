"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { LogOut, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { InvoiceDocument, getRecentInvoices } from "@/lib/api/invoice";
import { InvoiceCard } from "@/components/ui/invoice-card";

export default function DashboardPage() {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<{status: 'idle' | 'success' | 'error', message?: string, docId?: string, qualityWarnings?: string[]}>({ status: 'idle' });

  const fetchInvoices = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await getRecentInvoices(accessToken);
      setInvoices(data);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else {
      fetchInvoices();
    }
  }, [user, router, fetchInvoices]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const onUploadSuccess = (documentId: string, filename: string, qualityWarnings: string[]) => {
    setUploadStatus({
      status: 'success',
      message: `Successfully uploaded ${filename}`,
      docId: documentId,
      qualityWarnings,
    });
    // Refresh the list
    fetchInvoices();
  };

  const onUploadError = (error: string) => {
    setUploadStatus({
      status: 'error',
      message: error
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-slate-900 cursor-pointer" onClick={() => router.push('/')}>
            <span>Automator</span>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleLogout} variant="ghost" className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full">
              <LogOut className="size-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-16 px-6 max-w-7xl mx-auto relative z-10">
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-black mb-2">Invoice Dashboard</h1>
          <p className="text-slate-600 font-medium">Upload your supplier invoices for automatic data extraction.</p>
        </div>

        {uploadStatus.status === 'success' && (
           <div className="mb-8 space-y-3">
             <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-start sm:items-center space-x-3 text-slate-900 shadow-sm">
               <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 sm:mt-0 flex-shrink-0" />
               <div>
                 <p className="font-semibold text-sm">{uploadStatus.message}</p>
               </div>
               <Button variant="outline" className="ml-auto bg-white border-slate-200 hover:bg-slate-50 text-black rounded-full text-xs shadow-none h-8 font-medium" onClick={() => setUploadStatus({status: 'idle'})}>
                 Upload Another
               </Button>
             </div>
             {uploadStatus.qualityWarnings && uploadStatus.qualityWarnings.length > 0 && (
               <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                 <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Quality Warnings</p>
                 <ul className="space-y-1">
                   {uploadStatus.qualityWarnings.map((w, i) => (
                     <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                       <span className="mt-0.5 text-amber-500 shrink-0">&#9888;</span>
                       {w}
                     </li>
                   ))}
                 </ul>
                 <p className="text-xs text-amber-700 mt-3 font-medium">This invoice has been queued for manual review before extraction proceeds.</p>
               </div>
             )}
           </div>
        )}

        {uploadStatus.status === 'error' && (
           <div className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center space-x-3 text-rose-900 shadow-sm">
             <p className="font-semibold text-sm flex-1">{uploadStatus.message}</p>
             <Button variant="ghost" className="text-rose-900 hover:bg-rose-100 rounded-full h-8 px-3 font-medium" onClick={() => setUploadStatus({status: 'idle'})}>Dismiss</Button>
           </div>
        )}

        {uploadStatus.status !== 'success' && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs mb-16">
            <FileUpload 
              onUploadSuccess={onUploadSuccess}
              onUploadError={onUploadError}
            />
          </div>
        )}

        {/* Recent Documents Grid */}
        <div>
          <h2 className="text-xl font-bold mb-6 flex items-center text-black">
            <FileText className="w-5 h-5 mr-2 text-slate-400" />
            Recent Documents
          </h2>
          
          {isLoading ? (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-2xl p-6 h-44 animate-pulse">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl" />
                    <div className="w-20 h-6 bg-slate-100 rounded-full" />
                  </div>
                  <div className="w-3/4 h-5 bg-slate-100 rounded mb-4" />
                  <div className="w-1/2 h-4 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : invoices.length > 0 ? (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {invoices.map((invoice) => (
                <InvoiceCard key={invoice.id} invoice={invoice} />
              ))}
            </div>
          ) : (
            <div className="border-2 border-slate-200 border-dashed rounded-3xl h-64 flex items-center justify-center text-slate-500 flex-col bg-white">
               <div className="p-4 bg-slate-50 rounded-full mb-4">
                 <FileText className="w-10 h-10 opacity-20 text-slate-900" />
               </div>
               <p className="text-sm font-semibold text-slate-900">No documents yet</p>
               <p className="text-xs text-slate-500 mt-1">Upload an invoice to see it here</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
