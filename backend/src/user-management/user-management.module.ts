import { Module } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UserManagementController } from './user-management.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [UserManagementController],
  providers: [UserManagementService, PrismaService],
  exports: [UserManagementService],
})
export class UserManagementModule {}
