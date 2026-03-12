import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RedisService } from './common/redis/redis.service.js';
import { AuthModule } from './auth/auth.module.js';
import { InvoiceModule } from './invoice/invoice.module';
import { GeneratedInvoiceModule } from './generated-invoice/generated-invoice.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Global Rate Limit
    // 100 requests per 60 seconds
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL) || 60, // seconds
        limit: Number(process.env.THROTTLE_LIMIT) || 100,
      },
    ]),

    AuthModule,

    InvoiceModule,
    GeneratedInvoiceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RedisService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [RedisService],
})
export class AppModule {}