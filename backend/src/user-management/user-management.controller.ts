import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserRoleResponseDto } from './dto/user-role-response.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { OwnerOnly } from '../auth/decorators/owner-only.decorator';

@Controller('user-management')
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  /**
   * Update a user's role (Owner/Admin only)
   */
  @Post('roles/update')
  @OwnerOnly()
  async updateUserRole(
    @GetUser('id') ownerUserId: number,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<{ message: string; user: UserRoleResponseDto }> {
    const user = await this.userManagementService.updateUserRole(
      ownerUserId,
      dto,
    );

    return {
      message: `User role updated to ${dto.role}`,
      user,
    };
  }

  /**
   * Get all users (Owner/Admin only)
   */
  @Get('users')
  @OwnerOnly()
  async getAllUsers(
    @GetUser('id') ownerUserId: number,
  ): Promise<{ users: UserRoleResponseDto[] }> {
    const users = await this.userManagementService.getAllUsers(ownerUserId);
    return { users };
  }

  /**
   * Get a specific user's details (Owner/Admin only)
   */
  @Get('users/:id')
  @OwnerOnly()
  async getUser(
    @GetUser('id') ownerUserId: number,
    @Param('id', ParseIntPipe) userId: number,
  ): Promise<UserRoleResponseDto> {
    return await this.userManagementService.getUser(ownerUserId, userId);
  }

  /**
   * Get user statistics (Owner/Admin only)
   */
  @Get('stats/users')
  @OwnerOnly()
  async getUserStats(@GetUser('id') ownerUserId: number) {
    return await this.userManagementService.getUserStats(ownerUserId);
  }
}
