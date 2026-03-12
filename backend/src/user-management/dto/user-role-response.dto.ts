import { UserRole } from '../../auth/roles.constants';

export class UserRoleResponseDto {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isOwner: boolean;
  roleChangedAt?: Date;
  createdAt: Date;
}
