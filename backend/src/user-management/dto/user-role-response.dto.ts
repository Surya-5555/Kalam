import { UserRole } from '@prisma/client';

export class UserRoleResponseDto {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isOwner: boolean;
  roleChangedAt?: Date;
  createdAt: Date;
}
