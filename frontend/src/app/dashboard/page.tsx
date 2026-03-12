"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { InvoiceDocument, getRecentInvoices } from "@/lib/api/invoice";
import { InvoiceCard } from "@/components/ui/invoice-card";
import { RoleProtected } from "@/components/auth/role-protected";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardPage() {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setPageError(null);
      const data = await getRecentInvoices(accessToken);
      setInvoices(data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load recent invoices.",
      );
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

  const onUploadSuccess = (documentId: string) => {
    router.push(`/processing/${documentId}`);
  };

  const onUploadError = (error: string) => {
    setUploadError(error);
  };

  return (
    <RoleProtected mode="employee">
      <AppShell
        user={user}
        onLogout={handleLogout}
        title="Employee Workspace"
        subtitle="Upload invoices, monitor extraction status, and review normalized output without changing the existing employee flow."
        actions={
          <Button
            onClick={() => router.push('/create-invoice')}
            className="rounded-2xl bg-slate-900 px-6 text-white hover:bg-slate-700"
          >
            <FileText className="mr-2 h-4 w-4" />
            Create &amp; Pay Invoice
          </Button>
        }
      >
        <section className="space-y-6">

        {uploadError && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center space-x-3 text-rose-900 shadow-sm">
            <p className="font-semibold text-sm flex-1">{uploadError}</p>
            <Button variant="ghost" className="text-rose-900 hover:bg-rose-100 rounded-full h-8 px-3 font-medium" onClick={() => setUploadError(null)}>Dismiss</Button>
          </div>
        )}

        {pageError && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center space-x-3 text-amber-900 shadow-sm">
            <p className="font-semibold text-sm flex-1">{pageError}</p>
            <Button variant="ghost" className="text-amber-900 hover:bg-amber-100 rounded-full h-8 px-3 font-medium" onClick={fetchInvoices}>Retry</Button>
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <FileUpload
            onUploadSuccess={onUploadSuccess}
            onUploadError={onUploadError}
          />
        </div>

        {/* Recent Documents Grid */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
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
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onClick={() => router.push(`/results/${invoice.id}`)}
                />
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
        </section>
      </AppShell>
    </RoleProtected>
  );
}
