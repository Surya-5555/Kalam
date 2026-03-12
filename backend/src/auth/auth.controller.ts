import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { EmailService } from './email.service';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailService: EmailService,
  ) { }

  // =========================
  // SIGNUP
  // =========================
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    try {
      const user = await this.authService.signup(dto);
      return {
        message: 'Signup successful',
        user,
      };
    } catch (error) {
      if (error.message === 'Email already exists') {
        throw error;
      }
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // =========================
  // LOGIN
  // =========================
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const data = await this.authService.login(dto);

      res.cookie('refreshToken', data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return {
        accessToken: data.accessToken,
        user: data.user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // =========================
  // REFRESH TOKEN
  // =========================
  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) throw new UnauthorizedException('Invalid credentials');

      const { accessToken } = await this.authService.refresh(refreshToken);

      return { accessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // =========================
  // LOGOUT
  // =========================
  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) return { message: 'Already logged out' };

      await this.authService.logout(refreshToken);

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });

      return { message: 'Logged out successfully' };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // =========================
  // FORGOT PASSWORD
  // =========================
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60 } }) // Strict: 3 requests per 60s
  @Post('forgot-password')
  async forgotPassword(@Body() dto: RequestPasswordResetDto) {
    try {
      const user = await this.authService.findUserByEmail(dto.email);

      if (user) {
        const token = await this.passwordResetService.createPasswordResetToken(user.id);
        await this.emailService.sendPasswordResetEmail(dto.email, token);
      }

      // Always return the same response (prevents email enumeration)
      return {
        message: 'If an account with that email exists, a reset code has been sent.',
      };
    } catch {
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // =========================
  // RESET PASSWORD
  // =========================
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 } }) // Strict: 5 attempts per 60s
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    try {
      await this.passwordResetService.resetPassword(
        dto.token,
        dto.newPassword,
      );

      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Something went wrong');
    }
  }
}