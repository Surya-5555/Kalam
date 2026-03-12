import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UserRole } from '../auth/roles.constants';

describe('UserManagementService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as any;

  let service: UserManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserManagementService(prisma);
  });

  it('allows owner/admin to change a user role', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, isOwner: true })
      .mockResolvedValueOnce({ id: 2, role: UserRole.EMPLOYEE });
    prisma.user.update.mockResolvedValue({
      id: 2,
      name: 'Manager Candidate',
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      isOwner: false,
      roleChangedAt: new Date('2026-03-13T00:00:00.000Z'),
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
    });

    const result = await service.updateUserRole(1, {
      userId: 2,
      role: UserRole.MANAGER,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          role: UserRole.MANAGER,
          roleChangedBy: 1,
        }),
      }),
    );
    expect(result.role).toBe(UserRole.MANAGER);
  });

  it('rejects role changes from non-owner users', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 3, isOwner: false });

    await expect(
      service.updateUserRole(3, { userId: 4, role: UserRole.MANAGER }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents owner from changing their own role', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, isOwner: true })
      .mockResolvedValueOnce({ id: 1, role: UserRole.MANAGER, isOwner: true });

    await expect(
      service.updateUserRole(1, { userId: 1, role: UserRole.EMPLOYEE }),
    ).rejects.toThrow(BadRequestException);
  });
});
