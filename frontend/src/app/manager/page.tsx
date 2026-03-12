"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  CopyCheck,
  FileWarning,
  Filter,
  RefreshCcw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { RoleProtected } from "@/components/auth/role-protected";
import { AppShell } from "@/components/layout/app-shell";
import {
  getManagerDetailedReport,
  type ManagerDetailedReport,
  type ManagerReportFilters,
} from "@/lib/api/manager-reporting";
import {
  getManagedUsers,
  updateManagedUserRole,
  type ManagedUser,
} from "@/lib/api/user-management";
import type { AppRole } from "@/lib/role-routing";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatMonth(month: string) {
  const [year, mon] = month.split("-");
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

const initialFilters: ManagerReportFilters = {
  status: "",
  supplier: "",
};

export default function ManagerPage() {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<ManagerDetailedReport | null>(null);
  const [filters, setFilters] = useState<ManagerReportFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdatePendingFor, setRoleUpdatePendingFor] = useState<number | null>(null);

  const loadReport = async (nextFilters: ManagerReportFilters) => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getManagerDetailedReport(accessToken, nextFilters);
      setReport(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load manager report");
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!accessToken || !user?.isOwner) {
      return;
    }

    setUsersLoading(true);

    try {
      const data = await getManagedUsers(accessToken);
      setManagedUsers(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    void loadReport(filters);
  }, [accessToken, router, user]);

  useEffect(() => {
    void loadUsers();
  }, [accessToken, user?.isOwner]);

  const handleFilterChange = <K extends keyof ManagerReportFilters>(key: K, value: ManagerReportFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = async () => {
    await loadReport(filters);
  };

  const resetFilters = async () => {
    setFilters(initialFilters);
    await loadReport(initialFilters);
  };

  const handleRoleChange = async (targetUser: ManagedUser, nextRole: AppRole) => {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm(`Change ${targetUser.name} to ${nextRole}?`);
    if (!confirmed) {
      return;
    }

    setRoleUpdatePendingFor(targetUser.id);

    try {
      const updated = await updateManagedUserRole(accessToken, targetUser.id, nextRole);
      setManagedUsers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update user role");
    } finally {
      setRoleUpdatePendingFor(null);
    }
  };

  const summaryCards = useMemo(() => {
    if (!report) {
      return [];
    }

    return [
      {
        title: "Total invoices processed",
        value: report.overview.summary.totalProcessed,
        icon: BarChart3,
        tone: "text-slate-950 bg-slate-100",
      },
      {
        title: "Completed / partial / failed",
        value: `${report.overview.summary.completed} / ${report.overview.summary.partial} / ${report.overview.summary.failed}`,
        icon: CheckCircle2,
        tone: "text-emerald-700 bg-emerald-50",
      },
      {
        title: "Invoices needing review",
        value: report.invoicesNeedingReview.length,
        icon: FileWarning,
        tone: "text-amber-700 bg-amber-50",
      },
      {
        title: "Average processing time",
        value: `${report.overview.averageProcessingTime.averageTimeMinutes} min`,
        icon: Clock3,
        tone: "text-blue-700 bg-blue-50",
      },
      {
        title: "Duplicate invoice count",
        value: report.overview.complianceIssues.duplicateCount,
        icon: CopyCheck,
        tone: "text-rose-700 bg-rose-50",
      },
      {
        title: "Validation issue count",
        value: report.overview.complianceIssues.validationIssueCount,
        icon: AlertTriangle,
        tone: "text-orange-700 bg-orange-50",
      },
    ];
  }, [report]);

  const topSupplierSpend = report?.supplierMetrics.slice(0, 6) ?? [];
  const maxVolume = Math.max(1, ...(report?.monthlyTrend.map((item) => item.invoiceCount) ?? [1]));
  const maxSupplierCount = Math.max(1, ...(topSupplierSpend.map((item) => item.invoiceCount) ?? [1]));

  if (!user) {
    return null;
  }

  return (
    <RoleProtected mode="manager">
      <AppShell
        user={user}
        onLogout={logout}
        title="Manager Dashboard"
        subtitle="Track invoice throughput, review operational bottlenecks, and manage role assignments with backend-enforced access control."
        actions={
          <>
            <Button variant="outline" className="rounded-2xl border-slate-200" onClick={() => void loadReport(filters)}>
              <RefreshCcw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => router.push('/dashboard')}>
              Employee workspace
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              <Filter className="size-4" />
              Dashboard filters
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Date from</span>
                <input type="date" className="w-full rounded-2xl border border-slate-200 px-3 py-2.5" value={filters.dateFrom ?? ''} onChange={(event) => handleFilterChange('dateFrom', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Date to</span>
                <input type="date" className="w-full rounded-2xl border border-slate-200 px-3 py-2.5" value={filters.dateTo ?? ''} onChange={(event) => handleFilterChange('dateTo', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Status</span>
                <select className="w-full rounded-2xl border border-slate-200 px-3 py-2.5" value={filters.status ?? ''} onChange={(event) => handleFilterChange('status', event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Supplier</span>
                <input className="w-full rounded-2xl border border-slate-200 px-3 py-2.5" placeholder="Supplier name" value={filters.supplier ?? ''} onChange={(event) => handleFilterChange('supplier', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Uploaded by</span>
                <input className="w-full rounded-2xl border border-slate-200 px-3 py-2.5" placeholder="User ID" value={filters.uploadedBy ?? ''} onChange={(event) => handleFilterChange('uploadedBy', event.target.value ? Number(event.target.value) : undefined)} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => void applyFilters()}>
                Apply filters
              </Button>
              <Button variant="outline" className="rounded-2xl border-slate-200" onClick={() => void resetFilters()}>
                Reset
              </Button>
            </div>
          </section>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
              ))}
            </div>
          ) : report ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card) => (
                  <article key={card.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className={`inline-flex rounded-2xl p-3 ${card.tone}`}>
                      <card.icon className="size-5" />
                    </div>
                    <p className="mt-5 text-sm text-slate-500">{card.title}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                  </article>
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Monthly trend</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">Invoice volume trend</h2>
                    </div>
                    <span className="text-xs text-slate-400">{report.monthlyTrend.length} months</span>
                  </div>
                  <div className="mt-8 space-y-4">
                    {report.monthlyTrend.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No invoice activity yet.</p>
                    ) : (
                      report.monthlyTrend.map((item) => (
                        <div key={item.month} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">{formatMonth(item.month)}</span>
                            <span className="text-slate-500">{item.invoiceCount} invoices</span>
                          </div>
                          <div className="h-3 rounded-full bg-slate-100">
                            <div className="h-3 rounded-full bg-slate-900" style={{ width: `${(item.invoiceCount / maxVolume) * 100}%` }} />
                          </div>
                          <div className="flex gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-500" /> {item.completedCount} completed</span>
                            <span className="flex items-center gap-1"><XCircle className="size-3.5 text-rose-500" /> {item.failedCount} failed</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Quality and review</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">Operational issue tracker</h2>
                  </div>
                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-3xl bg-amber-50 p-5 text-amber-900">
                      <p className="text-sm font-medium">Invoices needing review</p>
                      <p className="mt-2 text-3xl font-semibold">{report.invoicesNeedingReview.length}</p>
                    </div>
                    <div className="rounded-3xl bg-rose-50 p-5 text-rose-900">
                      <p className="text-sm font-medium">OCR quality issues</p>
                      <p className="mt-2 text-3xl font-semibold">{report.overview.complianceIssues.ocrQualityIssueCount}</p>
                    </div>
                    <div className="rounded-3xl bg-blue-50 p-5 text-blue-900">
                      <p className="text-sm font-medium">Average cycle time</p>
                      <p className="mt-2 text-3xl font-semibold">{report.overview.averageProcessingTime.averageTimeSeconds}s</p>
                    </div>
                    <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900">
                      <p className="text-sm font-medium">Partial outcomes</p>
                      <p className="mt-2 text-3xl font-semibold">{report.overview.summary.partial}</p>
                    </div>
                  </div>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Supplier analytics</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">Supplier-wise invoice volume and spend</h2>
                  </div>
                  <div className="mt-8 space-y-4">
                    {topSupplierSpend.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No supplier metrics available yet.</p>
                    ) : (
                      topSupplierSpend.map((supplier) => (
                        <div key={`${supplier.supplierName}-${supplier.supplierGstin}`} className="rounded-3xl border border-slate-100 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-900">{supplier.supplierName}</p>
                              <p className="mt-1 text-xs text-slate-500">{supplier.supplierGstin}</p>
                            </div>
                            <div className="text-right text-sm text-slate-600">
                              <p>{supplier.invoiceCount} invoices</p>
                              <p className="font-semibold text-slate-900">{formatCurrency(supplier.totalSpend)}</p>
                            </div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-slate-900" style={{ width: `${(supplier.invoiceCount / maxSupplierCount) * 100}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Average invoice value: {formatCurrency(supplier.averageInvoiceAmount)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Review queue</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">Invoices needing attention</h2>
                  </div>
                  <div className="mt-8 space-y-3">
                    {report.invoicesNeedingReview.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No invoices currently need manager attention.</p>
                    ) : (
                      report.invoicesNeedingReview.map((invoice) => (
                        <button
                          key={invoice.documentId}
                          type="button"
                          className="flex w-full items-start justify-between rounded-3xl border border-slate-100 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => router.push(`/results/${invoice.documentId}`)}
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{invoice.fileName}</p>
                            <p className="mt-1 text-sm text-slate-500">{invoice.supplierName}</p>
                            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{invoice.reasonForReview}</p>
                          </div>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{invoice.status}</span>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Validation issue tracker</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">Issue type breakdown</h2>
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {report.validationIssues.map((issue) => (
                    <div key={issue.issueType} className="rounded-3xl border border-slate-100 p-5">
                      <p className="text-sm text-slate-500">{issue.issueType}</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-950">{issue.count}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{issue.percentage}% of issues</p>
                    </div>
                  ))}
                </div>
              </section>

              {user.isOwner ? (
                <section id="role-management" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Owner controls</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">Role management</h2>
                      <p className="mt-2 max-w-2xl text-sm text-slate-600">
                        Only owner accounts can promote or demote users. Changes take effect on the next refresh token rotation or next login.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                      <ShieldCheck className="size-4" />
                      Restricted control
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead>
                        <tr className="text-left text-slate-400">
                          <th className="pb-3 font-medium">User</th>
                          <th className="pb-3 font-medium">Current role</th>
                          <th className="pb-3 font-medium">Created</th>
                          <th className="pb-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usersLoading ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-500">Loading users…</td>
                          </tr>
                        ) : managedUsers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-500">No users found.</td>
                          </tr>
                        ) : (
                          managedUsers.map((managedUser) => {
                            const nextRole: AppRole = managedUser.role === 'MANAGER' ? 'EMPLOYEE' : 'MANAGER';
                            return (
                              <tr key={managedUser.id}>
                                <td className="py-4">
                                  <div>
                                    <p className="font-medium text-slate-900">{managedUser.name}</p>
                                    <p className="text-slate-500">{managedUser.email}</p>
                                  </div>
                                </td>
                                <td className="py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{managedUser.role}</span>
                                    {managedUser.isOwner ? (
                                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">OWNER</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-4 text-slate-500">{new Date(managedUser.createdAt).toLocaleDateString('en-IN')}</td>
                                <td className="py-4">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={managedUser.isOwner || roleUpdatePendingFor === managedUser.id}
                                    className="rounded-2xl border-slate-200"
                                    onClick={() => void handleRoleChange(managedUser, nextRole)}
                                  >
                                    {roleUpdatePendingFor === managedUser.id ? 'Updating…' : `Change to ${nextRole}`}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Users className="size-4" />
                    Role management is owner-only
                  </div>
                  <p className="mt-2">Ask the database owner or admin account to promote or demote users.</p>
                </section>
              )}
            </>
          ) : null}
        </div>
      </AppShell>
    </RoleProtected>
  );
}
