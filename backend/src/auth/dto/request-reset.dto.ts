import { IsEmail, IsString } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}