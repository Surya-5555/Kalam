import { apiFetch } from '../api';
import type { AppRole } from '../role-routing';

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: AppRole;
  isOwner: boolean;
  roleChangedAt?: string;
  createdAt: string;
}

export async function getManagedUsers(accessToken: string): Promise<ManagedUser[]> {
  const res = await apiFetch('/user-management/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to load users');
  }

  const data = await res.json();
  return data.users;
}

export async function updateManagedUserRole(
  accessToken: string,
  userId: number,
  role: AppRole,
): Promise<ManagedUser> {
  const res = await apiFetch('/user-management/roles/update', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ userId, role }),
  });

  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to update user role');
  }

  const data = await res.json();
  return data.user;
}
