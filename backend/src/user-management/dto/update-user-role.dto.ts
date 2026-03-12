import { IsInt, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../auth/roles.constants';

export class UpdateUserRoleDto {
  @IsInt()
  userId: number;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsInt()
  changedBy?: number;
}
