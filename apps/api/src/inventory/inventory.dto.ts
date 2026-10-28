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

const QTY = /^\d+(\.\d{1,3})?$/;
const SIGNED_QTY = /^-?\d+(\.\d{1,3})?$/;
const MONEY = /^\d+(\.\d{1,4})?$/;

export class StockQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() lowStock?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class AdjustmentDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() @MaxLength(80) lotCode?: string;
  @Matches(SIGNED_QTY) quantityDelta!: string;
  @IsString() @MinLength(4) @MaxLength(300) reason!: string;
  @IsOptional() @Matches(MONEY) unitCost?: string;
}

export class TransferDto {
  @IsString() fromWarehouseId!: string;
  @IsString() toWarehouseId!: string;
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() @MaxLength(80) lotCode?: string;
  @Matches(QTY) quantity!: string;
  @IsString() @MinLength(4) @MaxLength(300) reason!: string;
}

export class PurchaseLineDto {
  @IsString() productId!: string;
  @Matches(QTY) quantity!: string;
  @Matches(MONEY) unitCost!: string;
  @IsOptional() @Matches(MONEY) taxRate?: string;
}

export class CreatePurchaseDto {
  @IsString() supplierId!: string;
  @IsString() branchId!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsIn(['DRAFT', 'ORDERED']) status?: 'DRAFT' | 'ORDERED';
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class ReceiveLineDto {
  @IsString() lineId!: string;
  @Matches(QTY) quantity!: string;
  @IsOptional() @IsString() @MaxLength(80) lotCode?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class ReceivePurchaseDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines?: ReceiveLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class MovementQueryDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class PurchaseQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'])
  status?: 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
