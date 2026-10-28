import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { SalePaymentDto } from '../sales/sales.dto';

const MONEY = /^\d+(\.\d{1,4})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;

export class CreateAreaDto {
  @IsString() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @IsInt() sort?: number;
}

export class CreateTableDto {
  @IsString() areaId!: string;
  @IsString() @MinLength(1) @MaxLength(30) name!: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) seats?: number;
}

export class OpenOrderDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() tableId?: string;
  @IsIn(['DINE_IN', 'TAKEAWAY']) type!: 'DINE_IN' | 'TAKEAWAY';
  @IsOptional() @IsInt() @Min(1) @Max(50) guestCount?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class OrderItemDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @Matches(QTY) quantity!: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modifiers?: string[];
}

export class UpdateOrderItemDto {
  @IsIn(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'])
  status!: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
}

export class SplitOrderDto {
  @IsArray() @IsString({ each: true }) itemIds!: string[];
}

export class PayOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];
  @IsOptional() @Matches(MONEY) tip?: string;
  @IsOptional() @IsBoolean() tipAccepted?: boolean;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsString() registerId?: string;
}

export class CancelOrderDto {
  @IsString() @MinLength(5) @MaxLength(300) reason!: string;
  @IsOptional() @IsBoolean() waste?: boolean;
  @IsOptional() @IsBoolean() restock?: boolean;
}

export class CancelItemDto extends CancelOrderDto {}

export class RestaurantQueryDto {
  @IsOptional() @IsIn(['OPEN', 'SENT', 'PREPARING', 'READY', 'SERVED', 'PAID', 'CANCELLED'])
  status?: string;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() branchId?: string;
}
