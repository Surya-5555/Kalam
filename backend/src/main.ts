import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtAuthGuard } from './auth/guard/jwt-auth.guard';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PipelineExceptionFilter } from './common/filters/pipeline-exception.filter';

async function bootstrap() {
  // JWT Secret validation - fail fast
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser()); // for cookie
  app.use(helmet()); // extra protection for security headers

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 0);
  }

  // CORS configuration via environment variables
  const frontendUrls = process.env.FRONTEND_URL?.split(',').map((url) =>
    url.trim(),) || ['http://localhost:3000'];

  app.enableCors({
    origin: frontendUrls,
    credentials: true,
  });

  const reflector = app.get(Reflector); // reflector is ued to read @
  app.useGlobalGuards(new JwtAuthGuard(reflector)); // sets jwt as global (default) guard

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — must be registered AFTER pipes
  app.useGlobalFilters(new PipelineExceptionFilter());

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
