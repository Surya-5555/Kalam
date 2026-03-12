import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) { }

  // Generate a password reset code and save HASHED in DB
  async createPasswordResetToken(userId: number) {
    // Invalidate any existing unused tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });

    // Generate secure 6-char code (letters + digits + specials)
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&';
    const token = Array.from(crypto.randomBytes(6))
      .map((byte) => charset[byte % charset.length])
      .join('');

    // Hash the token before storing (so DB never has plain text)
    const hashedToken = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        token: hashedToken,
        expiresAt,
        used: false,
      },
    });

    return token; // Return plain token to send via email (never stored)
  }

  // Validate token — find all unused tokens for brute-force counting
  async validateResetToken(token: string) {
    // Get all unused, non-expired tokens
    const candidates = await this.prisma.passwordResetToken.findMany({
      where: { used: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    // Compare submitted token against each hashed token
    for (const record of candidates) {
      const isMatch = await bcrypt.compare(token, record.token);
      if (isMatch) {
        return { user: record.user, recordId: record.id };
      }
    }

    throw new BadRequestException('Invalid or expired code');
  }

  // Reset password using token
  async resetPassword(token: string, newPassword: string) {
    if (!newPassword) {
      throw new BadRequestException('New password is required');
    }

    const result = await this.validateResetToken(token);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await this.prisma.user.update({
      where: { id: result.user.id },
      data: { password: hashedPassword },
    });

    // Mark token as used (single-use)
    await this.prisma.passwordResetToken.update({
      where: { id: result.recordId },
      data: { used: true },
    });

    // Invalidate ALL remaining tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: result.user.id, used: false },
      data: { used: true },
    });

    return { message: 'Password successfully reset' };
  }
}