import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: nodemailer.Transporter;

    constructor(private readonly config: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.config.get('SMTP_HOST', 'smtp.gmail.com'),
            port: Number(this.config.get('SMTP_PORT', 587)),
            secure: false,
            auth: {
                user: this.config.get('SMTP_USER'),
                pass: this.config.get('SMTP_PASS'),
            },
        });
    }

    async sendPasswordResetEmail(to: string, token: string): Promise<void> {
        const smtpUser = this.config.get('SMTP_USER');
        if (!smtpUser) {
            this.logger.warn(
                `SMTP not configured. Reset token for ${to}: ${token}`,
            );
            return;
        }

        const appName = this.config.get('APP_NAME', 'JobPrep');

        try {
            await this.transporter.sendMail({
                from: `"${appName}" <${smtpUser}>`,
                to,
                subject: 'Password Reset Code',
                html: `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border-radius: 12px;">
            <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset</h2>
            <p style="color: #555; font-size: 14px; margin-bottom: 24px;">
              You requested a password reset. Use the code below to reset your password. This code expires in 30 minutes.
            </p>
            <div style="background: #1a1a2e; color: #fff; padding: 20px 24px; border-radius: 8px; text-align: center; font-size: 32px; font-family: monospace; letter-spacing: 8px; margin-bottom: 24px;">
              ${token}
            </div>
            <p style="color: #888; font-size: 12px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
            });
            this.logger.log(`Password reset email sent to ${to}`);
        } catch (error) {
            this.logger.error(`Failed to send reset email to ${to}`, error.stack);
            // Don't throw — the token is still created in DB, user can retry
        }
    }
}
