"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/role-routing";
import { getNavigationItems } from "@/lib/role-routing";

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function AppShell({
  user,
  onLogout,
  title,
  subtitle,
  children,
  actions,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = getNavigationItems(user);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(241,245,249,0.95),_rgba(255,255,255,1)_45%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur lg:flex lg:flex-col">
          <button
            type="button"
            onClick={() => router.push(user.role === 'MANAGER' ? '/manager' : '/dashboard')}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
          >
            <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
              KS
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Kalam OCR</p>
              <p className="text-xs text-slate-500">Invoice operations workspace</p>
            </div>
          </button>

          <div className="mt-6 rounded-3xl bg-slate-950 px-4 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Signed in as</p>
            <p className="mt-2 text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-slate-300">{user.email}</p>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-100">
              <span className="rounded-full bg-white/10 px-3 py-1">{user.role}</span>
              {user.isOwner ? (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">OWNER</span>
              ) : null}
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            {user.isOwner ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4" />
                  Owner controls enabled
                </div>
                <p className="mt-1 text-xs text-emerald-700">You can update user roles from the manager dashboard.</p>
              </div>
            ) : null}
            <Button
              onClick={onLogout}
              variant="outline"
              className="w-full rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="rounded-[28px] border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Operational workspace</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">{subtitle}</p>
              </div>
              {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
            </div>
          </header>

          <main className="mt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
