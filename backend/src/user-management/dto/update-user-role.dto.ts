import { IsInt, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserRoleDto {
  @IsInt()
  userId: number;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsInt()
  changedBy?: number;
}
