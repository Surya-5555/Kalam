import {IsString, IsEmail, MinLength, Matches } from 'class-validator'

export class SignupDto {
    @IsString()
    name : string

    @IsEmail()
    email : string
    
    @IsString()
    @MinLength(8)
    @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, { message: 'Invalid password format' })
    password : string
}