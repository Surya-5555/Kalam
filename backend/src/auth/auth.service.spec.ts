import { AuthService } from './auth.service';
import { UserRole } from './roles.constants';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  } as any;
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-token'),
  } as any;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(prisma, jwtService);
  });

  it('creates new users with EMPLOYEE as the default role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 1,
      name: 'Employee User',
      email: 'employee@example.com',
      role: UserRole.EMPLOYEE,
      password: 'hashed-password',
    });

    await service.signup({
      name: 'Employee User',
      email: 'employee@example.com',
      password: 'secret123',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.EMPLOYEE }),
      }),
    );
  });
});
