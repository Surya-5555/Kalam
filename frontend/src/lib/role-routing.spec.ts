import {
  getDefaultRouteForRole,
  getNavigationItems,
} from './role-routing';

describe('role routing', () => {
  it('routes managers to the manager dashboard after login', () => {
    expect(getDefaultRouteForRole('MANAGER')).toBe('/manager');
  });

  it('routes employees to the employee dashboard after login', () => {
    expect(getDefaultRouteForRole('EMPLOYEE')).toBe('/dashboard');
  });

  it('returns manager-specific navigation items', () => {
    const items = getNavigationItems({
      sub: 1,
      email: 'manager@example.com',
      name: 'Manager User',
      role: 'MANAGER',
      isOwner: false,
    });

    expect(items.map((item) => item.label)).toEqual(['Reports', 'Employee View']);
  });

  it('returns owner role-management navigation item', () => {
    const items = getNavigationItems({
      sub: 1,
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'MANAGER',
      isOwner: true,
    });

    expect(items.map((item) => item.label)).toContain('Role Management');
  });

  it('returns employee navigation items', () => {
    const items = getNavigationItems({
      sub: 2,
      email: 'employee@example.com',
      name: 'Employee User',
      role: 'EMPLOYEE',
      isOwner: false,
    });

    expect(items.map((item) => item.label)).toEqual(['Dashboard', 'Create Invoice']);
  });
});
