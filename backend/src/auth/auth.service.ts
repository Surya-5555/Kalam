import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) { }


  // signup service logic
  async signup(dto: SignupDto) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existingUser) {
        throw new BadRequestException('Email already exists');
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
      });

      const { password, ...result } = user;
      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new Error('Something went wrong');
    }
  }

  // login service logic
  async login(dto: LoginDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(dto.password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.createRefreshToken(user.id);

      const { password, ...result } = user;

      return {
        accessToken,
        refreshToken,
        user: result,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error('Something went wrong');
    }
  }

  // func to generate access token (jwt)
  private generateAccessToken(user: any) {
    const payload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    return this.jwtService.sign(payload, { expiresIn: '20m' });
  }

  // func to create refresh token
  private async createRefreshToken(userId: number) {
    const plainToken = randomBytes(64).toString('hex');
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.refreshToken.create({
      data: {
        token: tokenHash,
        userId,
        expiresAt,
      },
    });

    return plainToken;
  }

  // refresh token service logic
  async refresh(refreshToken: string) {
    try {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      const tokenRecord = await this.prisma.refreshToken.findFirst({
        where: {
          token: tokenHash,
          expiresAt: { gt: new Date() },
        },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: tokenRecord.userId },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const newAccessToken = this.generateAccessToken(user);

      return { accessToken: newAccessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error('Something went wrong');
    }
  }

  // logout service logic
  async logout(refreshToken: string) {
    try {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      const tokenRecord = await this.prisma.refreshToken.findFirst({
        where: {
          token: tokenHash,
          expiresAt: { gt: new Date() },
        },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error('Something went wrong');
    }
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

}
