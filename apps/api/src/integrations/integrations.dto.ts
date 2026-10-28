import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class FiscalConfigDto {
  @IsIn(['disabled', 'test', 'provider'])
  provider!: 'disabled' | 'test' | 'provider';
  @IsIn(['TEST', 'PRODUCTION']) mode!: 'TEST' | 'PRODUCTION';
  @IsOptional() @IsString() @MaxLength(80) providerName?: string;
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(500) apiSecret?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class PaymentAccountDto {
  @IsString() @MinLength(2) @MaxLength(60) provider!: string;
  @IsString() @MinLength(2) @MaxLength(120) accountRef!: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsIn(['TEST', 'PRODUCTION']) mode?: 'TEST' | 'PRODUCTION';
  @IsOptional() @IsBoolean() active?: boolean;
}

export class FiscalSubmitDto {
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
