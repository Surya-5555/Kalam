import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CleanupService {
  constructor(private readonly prisma: PrismaService) {}

  // Run every day at midnight
  @Cron('0 0 * * *')
  async deleteExpiredRefreshTokens() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    console.log(`Deleted ${result.count} expired refresh tokens`);
  }
}