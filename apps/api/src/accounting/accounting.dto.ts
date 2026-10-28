import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY = /^\d+(\.\d{1,2})?$/;

export class AccountDto {
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  type!: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() parentCode?: string;
}

export class PeriodDto {
  @IsString() @MinLength(3) @MaxLength(80) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

export class JournalLineDto {
  @IsString() accountId!: string;
  @Matches(MONEY) debit!: string;
  @Matches(MONEY) credit!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class CreateEntryDto {
  @IsDateString() date!: string;
  @IsString() @MinLength(3) @MaxLength(300) description!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class AccountingConfigDto {
  @IsBoolean() enabled!: boolean;
}

export class AccountingQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) pageSize?: number;
}
