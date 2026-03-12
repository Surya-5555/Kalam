export type AppRole = 'EMPLOYEE' | 'MANAGER';

export interface AuthUser {
  sub: number;
  email: string;
  name: string;
  role: AppRole | null;
  isOwner: boolean;
}

export function getDefaultRouteForRole(role: AppRole | null | undefined): string {
  return role === 'MANAGER' ? '/manager' : '/dashboard';
}

export function canAccessEmployeeRoutes(role: AppRole | null | undefined): boolean {
  return role === 'EMPLOYEE' || role === 'MANAGER';
}

export function canAccessManagerRoutes(role: AppRole | null | undefined): boolean {
  return role === 'MANAGER';
}

export function getNavigationItems(user: AuthUser | null) {
  if (!user) {
    return [];
  }

  if (user.role === 'MANAGER') {
    return [
      { href: '/manager', label: 'Reports' },
      { href: '/dashboard', label: 'Employee View' },
      ...(user.isOwner ? [{ href: '/manager#role-management', label: 'Role Management' }] : []),
    ];
  }

  return [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/create-invoice', label: 'Create Invoice' },
  ];
}
