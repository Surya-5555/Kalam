"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  canAccessEmployeeRoutes,
  canAccessManagerRoutes,
  getDefaultRouteForRole,
} from "@/lib/role-routing";

interface RoleProtectedProps {
  mode: 'employee' | 'manager';
  children: React.ReactNode;
}

export function RoleProtected({ mode, children }: RoleProtectedProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }

    if (!user) {
      return;
    }

    const allowed =
      mode === 'employee'
        ? canAccessEmployeeRoutes(user.role)
        : canAccessManagerRoutes(user.role);

    if (!allowed) {
      router.replace(`/forbidden?from=${encodeURIComponent(getDefaultRouteForRole(user.role))}`);
    }
  }, [accessToken, mode, router, user]);

  if (!accessToken || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="size-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  const allowed =
    mode === 'employee'
      ? canAccessEmployeeRoutes(user.role)
      : canAccessManagerRoutes(user.role);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
