import { ConflictException, Injectable } from '@nestjs/common';
import type { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { roundQuantity } from '@saldio/shared';

export function stockKeyFor(
  productId: string,
  variantId?: string | null,
  lotCode?: string | null,
): string {
  return `${productId}:${variantId ?? ''}:${lotCode ?? ''}`;
}

export interface StockMoveInput {
  tenantId?: string;
  warehouseId: string;
  productId: string;
  variantId?: string | null;
  lotCode?: string | null;
  expiresAt?: Date | null;
  quantity: string | number;
  unitCost?: string | number;
  type: MovementType;
  referenceType: string;
  referenceId?: string;
  reason?: string;
  userId?: string;
  productName?: string;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new ConflictException('Contexto de empresa requerido.');
    return id;
  }

  async ensure(input: {
    tenantId?: string;
    warehouseId: string;
    productId: string;
    variantId?: string | null;
    lotCode?: string | null;
    expiresAt?: Date | null;
  }) {
    const tenantId = input.tenantId ?? this.tenant();
    const stockKey = stockKeyFor(input.productId, input.variantId, input.lotCode);
    return this.db.stockLevel.upsert({
      where: {
        tenantId_warehouseId_stockKey: {
          tenantId,
          warehouseId: input.warehouseId,
          stockKey,
        },
      },
      update: {},
      create: {
        tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        variantId: input.variantId || null,
        stockKey,
        lotKey: input.lotCode ?? '',
        lotCode: input.lotCode ?? null,
        expiresAt: input.expiresAt ?? null,
        quantity: 0,
      },
    });
  }

  /**
   * Aplica un movimiento y actualiza existencias de forma atomica.
   * Para salidas usa UPDATE condicional para impedir stock negativo.
   */
  async apply(input: StockMoveInput) {
    const tenantId = input.tenantId ?? this.tenant();
    const quantity = roundQuantity(input.quantity);
    const numeric = Number(quantity);
    if (!numeric) return null;
    await this.ensure({
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      lotCode: input.lotCode,
      expiresAt: input.expiresAt,
    });
    const stockKey = stockKeyFor(input.productId, input.variantId, input.lotCode);
    if (numeric < 0) {
      const result = await this.db.stockLevel.updateMany({
        where: {
          tenantId,
          warehouseId: input.warehouseId,
          stockKey,
          quantity: { gte: Math.abs(numeric) },
        },
        data: { quantity: { decrement: Math.abs(numeric) } },
      });
      if (result.count === 0) {
        const current = await this.db.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_stockKey: {
              tenantId,
              warehouseId: input.warehouseId,
              stockKey,
            },
          },
          select: { quantity: true },
        });
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: `Existencias insuficientes para ${input.productName ?? 'el producto'}.`,
          available: current?.quantity?.toString() ?? '0',
          requested: Math.abs(numeric).toFixed(3),
          productId: input.productId,
        });
      }
    } else {
      await this.db.stockLevel.update({
        where: {
          tenantId_warehouseId_stockKey: {
            tenantId,
            warehouseId: input.warehouseId,
            stockKey,
          },
        },
        data: { quantity: { increment: numeric } },
      });
    }
    return this.db.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        variantId: input.variantId || null,
        lotCode: input.lotCode ?? null,
        type: input.type,
        quantity,
        unitCost: input.unitCost ?? 0,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        userId: input.userId,
      },
    });
  }

  async available(
    warehouseId: string,
    productId: string,
    variantId?: string | null,
    lotCode?: string | null,
  ): Promise<string> {
    const row = await this.db.stockLevel.findUnique({
      where: {
        tenantId_warehouseId_stockKey: {
          tenantId: this.tenant(),
          warehouseId,
          stockKey: stockKeyFor(productId, variantId, lotCode),
        },
      },
    });
    return row?.quantity.toString() ?? '0';
  }
}
