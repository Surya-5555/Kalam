import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserRoleResponseDto } from './dto/user-role-response.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UserManagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update a user's role (Owner/Admin only)
   * Can only be called by users with isOwner = true
   */
  async updateUserRole(
    ownerUserId: number,
    dto: UpdateUserRoleDto,
  ): Promise<UserRoleResponseDto> {
    // Verify the owner is actually an owner
    const ownerUser = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });

    if (!ownerUser || !ownerUser.isOwner) {
      throw new ForbiddenException(
        'Only database owner/admin can change user roles',
      );
    }

    // Find the target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    if (targetUser.id === ownerUserId) {
      throw new BadRequestException('Owner cannot change their own role');
    }

    // Update the user's role
    const updatedUser = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        role: dto.role,
        roleChangedBy: ownerUserId,
        roleChangedAt: new Date(),
      },
    });

    return this.mapUserToResponseDto(updatedUser);
  }

  /**
   * Get all users with their roles (Owner/Admin only)
   */
  async getAllUsers(ownerUserId: number): Promise<UserRoleResponseDto[]> {
    // Verify the owner is actually an owner
    const ownerUser = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });

    if (!ownerUser || !ownerUser.isOwner) {
      throw new ForbiddenException(
        'Only database owner/admin can view all users',
      );
    }

    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isOwner: true,
        roleChangedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map((user) => this.mapUserToResponseDto(user));
  }

  /**
   * Get a single user's details (Owner/Admin only)
   */
  async getUser(
    ownerUserId: number,
    userId: number,
  ): Promise<UserRoleResponseDto> {
    // Verify the owner is actually an owner
    const ownerUser = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });

    if (!ownerUser || !ownerUser.isOwner) {
      throw new ForbiddenException(
        'Only database owner/admin can view user details',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isOwner: true,
        roleChangedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return this.mapUserToResponseDto(user);
  }

  /**
   * Get user statistics (Owner/Admin only)
   */
  async getUserStats(ownerUserId: number) {
    // Verify the owner is actually an owner
    const ownerUser = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
    });

    if (!ownerUser || !ownerUser.isOwner) {
      throw new ForbiddenException(
        'Only database owner/admin can view user statistics',
      );
    }

    const [totalUsers, employeeCount, managerCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.EMPLOYEE } }),
      this.prisma.user.count({ where: { role: UserRole.MANAGER } }),
    ]);

    return {
      totalUsers,
      employeeCount,
      managerCount,
      ownerCount: 1, // Usually only one owner, but can be more
    };
  }

  /**
   * Map User entity to response DTO
   */
  private mapUserToResponseDto(user: any): UserRoleResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isOwner: user.isOwner,
      roleChangedAt: user.roleChangedAt,
      createdAt: user.createdAt,
    };
  }
}
