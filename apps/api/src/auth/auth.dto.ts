import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'usuario' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class SelectTenantDto {
  @IsString()
  selectionToken!: string;

  @IsString()
  tenantId!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;

  @IsString()
  confirmPassword!: string;
}

export class ChangeUsernameDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  username!: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsString()
  confirmPassword!: string;
}
