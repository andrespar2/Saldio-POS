import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UpdateStoreDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(30) taxType?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) ownerName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional()
  @IsIn(['SUPERMARKET', 'RESTAURANT', 'CLOTHING', 'HARDWARE', 'GENERAL'])
  businessType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsBoolean() confirmIncompatible?: boolean;
}

export class ChangeStoreStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'DISABLED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ChangePlanDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsObject()
  limits?: Record<string, number>;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreatePlatformAdminDto {
  @IsString() @MinLength(3) @MaxLength(120) fullName!: string;
  @IsString() @MinLength(4) @MaxLength(32) username!: string;
  @IsEmail() @MaxLength(180) email!: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'SUPPORT']) role!: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

export class UpdatePlatformAdminDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) fullName?: string;
  @IsOptional() @IsIn(['SUPER_ADMIN', 'ADMIN', 'SUPPORT']) role?: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsString() reason?: string;
}

export class AdminResetDto {
  @IsString() @MinLength(5) @MaxLength(300) reason!: string;
}

export class SupportSessionDto {
  @IsString() @MinLength(5) @MaxLength(300) reason!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(120) minutes?: number;
}

export class PlanDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsString() price!: string;
  @IsArray() @IsString({ each: true }) modules!: string[];
  @IsObject() limits!: Record<string, number>;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() price?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @IsObject() limits?: Record<string, number>;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
}

export class PlatformSettingsDto {
  @IsOptional() @IsBoolean() autoApproveStores?: boolean;
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(300) publicNotice?: string;
}

export class AuditQueryDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
