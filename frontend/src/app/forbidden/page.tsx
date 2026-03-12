import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const fallback = params.from || '/dashboard';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="size-7" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">403</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Access denied</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Your account does not have permission to open this section. Use the workspace assigned to your role.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800">
            <Link href={fallback}>Go to workspace</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl border-slate-200">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
