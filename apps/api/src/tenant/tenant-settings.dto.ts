import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStoreSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CreateBranchDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
  @IsString() @MinLength(3) @MaxLength(200) address!: string;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CreateWarehouseDto {
  @IsString() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
}

export class CreateRegisterDto {
  @IsString() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
}

export class CreateEmployeeDto {
  @IsString() @MinLength(3) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) document?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsIn(['OWNER', 'ADMIN', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'WAITER', 'KITCHEN'])
  role!: 'OWNER' | 'ADMIN' | 'CASHIER' | 'INVENTORY' | 'ACCOUNTANT' | 'WAITER' | 'KITCHEN';
}

export class CreateStoreUserDto {
  @IsString() @MinLength(3) @MaxLength(120) fullName!: string;
  @IsString() @MinLength(4) @MaxLength(32) username!: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
  @IsIn(['OWNER', 'ADMIN', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'WAITER', 'KITCHEN'])
  role!: 'OWNER' | 'ADMIN' | 'CASHIER' | 'INVENTORY' | 'ACCOUNTANT' | 'WAITER' | 'KITCHEN';
  @IsOptional() @IsString() branchId?: string;
}

export class UpdateStoreUserDto {
  @IsOptional() @IsIn(['OWNER', 'ADMIN', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'WAITER', 'KITCHEN'])
  role?: 'OWNER' | 'ADMIN' | 'CASHIER' | 'INVENTORY' | 'ACCOUNTANT' | 'WAITER' | 'KITCHEN';
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() reason?: string;
}

export class ResetStoreUserDto {
  @IsString() @MinLength(5) @MaxLength(300) reason!: string;
}

export class OnboardingDto {
  @IsString() key!: string;
  @IsBoolean() completed!: boolean;
  @IsOptional() @IsObject() progress?: Record<string, unknown>;
}

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
