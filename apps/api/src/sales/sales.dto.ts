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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY = /^\d+(\.\d{1,4})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;
const METHODS = ['CASH', 'CARD', 'TRANSFER', 'CREDIT', 'OTHER'] as const;

export class SaleItemDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @Matches(QTY) quantity!: string;
  @IsOptional() @Matches(MONEY) unitPrice?: string;
  @IsOptional() @Matches(MONEY) discountPercent?: string;
  @IsOptional() @Matches(MONEY) discountAmount?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(80) lotCode?: string;
}

export class SalePaymentDto {
  @IsIn(METHODS) method!: (typeof METHODS)[number];
  @Matches(MONEY) amount!: string;
  @IsOptional() @Matches(MONEY) received?: string;
  @IsOptional() @Matches(MONEY) tip?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

export class CreateSaleDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() registerId?: string;
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsIn(['SALE', 'CREDIT']) type?: 'SALE' | 'CREDIT';
  @IsOptional() @IsIn(['SALE', 'CREDIT', 'QUOTE']) saleType?: 'SALE' | 'CREDIT' | 'QUOTE';
  @IsArray() @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];
  @IsOptional() @Matches(MONEY) tip?: string;
  @IsOptional() @IsBoolean() tipAccepted?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

export class ReturnLineDto {
  @IsString() saleLineId!: string;
  @Matches(QTY) quantity!: string;
  @IsOptional() @IsBoolean() restock?: boolean;
}

export class CreateReturnDto {
  @IsIn(['PARTIAL', 'TOTAL']) type!: 'PARTIAL' | 'TOTAL';
  @IsString() @MinLength(5) @MaxLength(300) reason!: string;
  @IsIn(METHODS) refundMethod!: (typeof METHODS)[number];
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsBoolean() waste?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}

export class SalesQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsIn(['CONFIRMED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED'])
  status?: 'CONFIRMED' | 'VOIDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class CashOpenDto {
  @IsString() registerId!: string;
  @Matches(MONEY) openingAmount!: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class CashCloseDto {
  @Matches(MONEY) countedAmount!: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class CashMovementDto {
  @IsIn(['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'EXPENSE']) type!: 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'EXPENSE';
  @Matches(MONEY) amount!: string;
  @IsString() @MinLength(3) @MaxLength(300) description!: string;
}

export class ReceivableQueryDto {
  @IsOptional() @IsIn(['OPEN', 'PARTIAL', 'PAID', 'WRITTEN_OFF'])
  status?: 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class PayReceivableDto {
  @Matches(MONEY) amount!: string;
  @IsIn(METHODS) method!: (typeof METHODS)[number];
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

export class QuoteLineDto extends SaleItemDto {}

export class CreateQuoteDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}

export class QuoteQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED'])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class CreateExpenseDto {
  @IsString() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(80) category!: string;
  @IsString() @MinLength(3) @MaxLength(300) description!: string;
  @Matches(MONEY) amount!: string;
  @IsOptional() @IsIn(METHODS) paymentMethod?: (typeof METHODS)[number];
  @IsOptional() @IsString() cashSessionId?: string;
}

export class ReceiptQueryDto {
  @IsOptional() @IsIn(['html', 'pdf']) format?: 'html' | 'pdf';
  @IsOptional() @IsIn(['58', '80', 'a4']) width?: '58' | '80' | 'a4';
  @IsOptional() @IsString() formatName?: string;
}
