import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';

describe('RolesGuard', () => {
  it('allows access when user has required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.MANAGER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.MANAGER } }),
      }),
    } as any;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects employee access to manager-only endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.MANAGER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.EMPLOYEE } }),
      }),
    } as any;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
