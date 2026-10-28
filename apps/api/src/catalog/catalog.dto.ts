import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
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

export class ListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class VariantDto {
  @IsString() @MinLength(1) @MaxLength(60) sku!: string;
  @IsOptional() @IsString() @MaxLength(80) barcode?: string;
  @IsOptional() @IsString() @MaxLength(40) size?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @Matches(MONEY) priceOverride?: string;
}

export class CreateProductDto {
  @IsString() @MinLength(1) @MaxLength(60) sku!: string;
  @IsOptional() @IsString() @MaxLength(80) barcode?: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(['SIMPLE', 'VARIANT', 'WEIGHTED', 'SERVICE', 'RECIPE']) type?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsString() unitId!: string;
  @Matches(MONEY) price!: string;
  @IsOptional() @Matches(MONEY) wholesalePrice?: string;
  @IsOptional() @Matches(QTY) wholesaleMinQty?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
  @IsOptional() @IsBoolean() lotTracking?: boolean;
  @IsOptional() @Matches(QTY) reorderPoint?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Matches(QTY) initialStock?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VariantDto)
  variants?: VariantDto[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(80) barcode?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @Matches(MONEY) price?: string;
  @IsOptional() @Matches(MONEY) wholesalePrice?: string;
  @IsOptional() @Matches(QTY) wholesaleMinQty?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
  @IsOptional() @IsBoolean() lotTracking?: boolean;
  @IsOptional() @Matches(QTY) reorderPoint?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() reason?: string;
}

export class CreateVariantDto extends VariantDto {
  @IsOptional() @Matches(QTY) initialStock?: string;
  @IsOptional() @IsString() warehouseId?: string;
}

export class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsInt() sort?: number;
}

export class TaxDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @Matches(MONEY) rate!: string;
}

export class UnitDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsString() @MinLength(1) @MaxLength(10) code!: string;
  @IsOptional() @IsBoolean() allowDecimal?: boolean;
  @IsOptional() @IsString() baseUnitId?: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,6})?$/) conversionFactor?: string;
}

export class CustomerDto {
  @IsString() @MinLength(2) @MaxLength(140) name!: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @Matches(MONEY) creditLimit?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SupplierDto {
  @IsString() @MinLength(2) @MaxLength(140) name!: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
