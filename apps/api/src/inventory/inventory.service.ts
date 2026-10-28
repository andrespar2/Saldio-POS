import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeLine, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { uuid } from '../common/security';
import { StockService } from './stock.service';
import type { AuthContext } from '../common/guards';
import {
  AdjustmentDto,
  CreatePurchaseDto,
  MovementQueryDto,
  PurchaseQueryDto,
  ReceivePurchaseDto,
  StockQueryDto,
  TransferDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly stock: StockService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new NotFoundException('Contexto de tienda requerido.');
    return id;
  }

  async stockList(query: StockQueryDto) {
    const tenantId = this.tenant();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();
    const rows = await this.db.stockLevel.findMany({
      where: {
        tenantId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              product: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                  { barcode: { contains: search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            reorderPoint: true,
            unit: { select: { allowDecimal: true, code: true } },
          },
        },
        variant: { select: { id: true, sku: true, size: true, color: true } },
        warehouse: { select: { id: true, name: true, branchId: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { updatedAt: 'desc' }],
    });
    const filtered = query.lowStock
      ? rows.filter(
          (row) =>
            row.product.reorderPoint !== null &&
            Number(row.quantity) <= Number(row.product.reorderPoint),
        )
      : rows;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async movements(query: MovementQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.InventoryMovementWhereInput = {
      tenantId: this.tenant(),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.inventoryMovement.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      }),
      this.db.inventoryMovement.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  private async assertWarehouse(id: string, auth?: AuthContext) {
    const warehouse = await this.db.warehouse.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!warehouse) throw new BadRequestException('Bodega inválida.');
    if (auth?.branchId && auth.branchId !== warehouse.branchId) {
      throw new ForbiddenException('No puede operar una bodega de otra sucursal.');
    }
    return warehouse;
  }

  private async assertProduct(id: string) {
    const product = await this.db.product.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!product) throw new BadRequestException('Producto inválido.');
    return product;
  }

  async adjust(auth: AuthContext, dto: AdjustmentDto, ip?: string) {
    await this.assertWarehouse(dto.warehouseId, auth);
    const product = await this.assertProduct(dto.productId);
    if (!product.trackInventory) {
      throw new BadRequestException('El producto no controla inventario.');
    }
    if (Number(dto.quantityDelta) === 0) {
      throw new BadRequestException('La cantidad del ajuste no puede ser cero.');
    }
    const refId = uuid();
    const movement = await this.stock.apply({
      warehouseId: dto.warehouseId,
      productId: dto.productId,
      variantId: dto.variantId,
      lotCode: dto.lotCode,
      quantity: dto.quantityDelta,
      unitCost: dto.unitCost ?? product.cost.toString(),
      type: 'ADJUSTMENT',
      referenceType: 'ADJUSTMENT',
      referenceId: refId,
      reason: dto.reason,
      userId: auth.userId,
      productName: product.name,
    });
    await this.audit.tenant(auth, {
      action: 'STOCK_ADJUSTED',
      entityType: 'InventoryMovement',
      entityId: movement?.id,
      after: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantityDelta,
        reason: dto.reason,
      },
      ip,
    });
    return movement;
  }

  async transfer(auth: AuthContext, dto: TransferDto, ip?: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Las bodegas de origen y destino deben ser diferentes.');
    }
    await this.assertWarehouse(dto.fromWarehouseId, auth);
    await this.assertWarehouse(dto.toWarehouseId, auth);
    const product = await this.assertProduct(dto.productId);
    const quantity = Number(dto.quantity);
    if (quantity <= 0) throw new BadRequestException('Cantidad inválida.');
    const refId = uuid();
    await this.stock.apply({
      warehouseId: dto.fromWarehouseId,
      productId: dto.productId,
      variantId: dto.variantId,
      lotCode: dto.lotCode,
      quantity: -quantity,
      unitCost: product.cost.toString(),
      type: 'TRANSFER_OUT',
      referenceType: 'TRANSFER',
      referenceId: refId,
      reason: dto.reason,
      userId: auth.userId,
      productName: product.name,
    });
    await this.stock.apply({
      warehouseId: dto.toWarehouseId,
      productId: dto.productId,
      variantId: dto.variantId,
      lotCode: dto.lotCode,
      quantity,
      unitCost: product.cost.toString(),
      type: 'TRANSFER_IN',
      referenceType: 'TRANSFER',
      referenceId: refId,
      reason: dto.reason,
      userId: auth.userId,
      productName: product.name,
    });
    await this.audit.tenant(auth, {
      action: 'STOCK_TRANSFERRED',
      entityType: 'InventoryMovement',
      entityId: refId,
      after: {
        productId: dto.productId,
        from: dto.fromWarehouseId,
        to: dto.toWarehouseId,
        quantity: dto.quantity,
      },
      ip,
    });
    return { ok: true, reference: refId };
  }

  async listPurchases(query: PurchaseQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId: this.tenant(),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.purchase.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
      }),
      this.db.purchase.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async purchase(id: string) {
    const purchase = await this.db.purchase.findFirst({
      where: { id, tenantId: this.tenant() },
      include: {
        supplier: true,
        warehouse: true,
        branch: true,
        lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada.');
    return purchase;
  }

  async createPurchase(auth: AuthContext, dto: CreatePurchaseDto, ip?: string) {
    if (!dto.lines.length) throw new BadRequestException('Agregue al menos una línea.');
    if (auth.branchId && auth.branchId !== dto.branchId) {
      throw new ForbiddenException('No puede comprar para una sucursal distinta a la asignada.');
    }
    const tenantId = this.tenant();
    const [supplier, branch, warehouse] = await Promise.all([
      this.db.supplier.findFirst({ where: { id: dto.supplierId, tenantId } }),
      this.db.branch.findFirst({ where: { id: dto.branchId, tenantId } }),
      this.db.warehouse.findFirst({ where: { id: dto.warehouseId, tenantId } }),
    ]);
    if (!supplier) throw new BadRequestException('Proveedor inválido.');
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    if (!warehouse) throw new BadRequestException('Bodega inválida.');
    let subtotal = 0;
    let tax = 0;
    const prepared: Array<{
      productId: string;
      description: string;
      quantity: string;
      unitCost: string;
      taxRate: string;
      total: string;
    }> = [];
    for (const line of dto.lines) {
      const product = await this.db.product.findFirst({
        where: { id: line.productId, tenantId },
        include: { tax: true },
      });
      if (!product || !product.active) {
        throw new BadRequestException('Producto inválido o inactivo.');
      }
      const rate = line.taxRate ?? product.tax?.rate.toString() ?? '0';
      const computed = computeLine({
        quantity: line.quantity,
        unitPrice: line.unitCost,
        taxRate: rate,
      });
      subtotal += Number(computed.gross);
      tax += Number(computed.tax);
      prepared.push({
        productId: product.id,
        description: product.name,
        quantity: line.quantity,
        unitCost: line.unitCost,
        taxRate: rate,
        total: computed.total,
      });
    }
    const seq = await this.sequence.next(tenantId, 'PURCHASE');
    const purchaseRecord = await this.db.purchase.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        number: this.sequence.format('C', seq),
        status: dto.status ?? 'ORDERED',
        subtotal: roundMoney(subtotal),
        tax: roundMoney(tax),
        total: roundMoney(subtotal + tax),
        notes: dto.notes,
        createdById: auth.userId,
      },
    });
    await this.db.purchaseLine.createMany({
      data: prepared.map((line) => ({
        tenantId,
        purchaseId: purchaseRecord.id,
        ...line,
      })),
    });
    const purchase = await this.db.purchase.findFirstOrThrow({
      where: { id: purchaseRecord.id },
      include: { lines: true, supplier: true },
    });
    await this.audit.tenant(auth, {
      action: 'PURCHASE_CREATED',
      entityType: 'Purchase',
      entityId: purchase.id,
      after: { number: purchase.number, total: purchase.total.toString() },
      ip,
    });
    return purchase;
  }

  async receivePurchase(
    auth: AuthContext,
    id: string,
    dto: ReceivePurchaseDto,
    ip?: string,
  ) {
    const tenantId = this.tenant();
    const purchase = await this.db.purchase.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada.');
    if (auth.branchId && auth.branchId !== purchase.branchId) {
      throw new ForbiddenException('La compra pertenece a otra sucursal.');
    }
    if (purchase.status === 'CANCELLED') {
      throw new ConflictException('La compra está cancelada.');
    }
    if (purchase.status === 'DRAFT') {
      throw new ConflictException('Confirme la orden de compra antes de recibir.');
    }
    if (purchase.status === 'RECEIVED') {
      throw new ConflictException('La compra ya fue recibida por completo.');
    }
    const requested: Array<{
      lineId: string;
      quantity: string;
      lotCode?: string;
      expiresAt?: string;
    }> = dto.lines?.length
      ? dto.lines
      : purchase.lines
          .filter((line) => Number(line.receivedQty) < Number(line.quantity))
          .map((line) => ({
            lineId: line.id,
            quantity: (Number(line.quantity) - Number(line.receivedQty)).toFixed(3),
          }));
    for (const received of requested) {
      const line = purchase.lines.find((l) => l.id === received.lineId);
      if (!line) throw new BadRequestException('Línea de compra inválida.');
      const remaining = Number(line.quantity) - Number(line.receivedQty);
      const qty = Number(received.quantity);
      if (qty <= 0 || qty > remaining + 0.0001) {
        throw new BadRequestException(
          `Cantidad inválida para ${line.description}. Disponible por recibir: ${remaining}.`,
        );
      }
      const product = await this.db.product.findFirst({
        where: { id: line.productId, tenantId },
      });
      if (!product) throw new BadRequestException('Producto inválido.');
      if (product.trackInventory) {
        await this.stock.apply({
          warehouseId: purchase.warehouseId,
          productId: line.productId,
          lotCode: received.lotCode,
          expiresAt: received.expiresAt ? new Date(received.expiresAt) : undefined,
          quantity: qty,
          unitCost: line.unitCost.toString(),
          type: 'PURCHASE_RECEIPT',
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          reason: `Recepción ${purchase.number}`,
          userId: auth.userId,
          productName: product.name,
        });
      }
      await this.db.purchaseLine.update({
        where: { id: line.id },
        data: { receivedQty: { increment: qty } },
      });
    }
    const lines = await this.db.purchaseLine.findMany({
      where: { purchaseId: purchase.id, tenantId },
    });
    const complete = lines.every(
      (line) => Number(line.receivedQty) >= Number(line.quantity) - 0.0001,
    );
    const updated = await this.db.purchase.update({
      where: { id },
      data: {
        status: complete ? 'RECEIVED' : 'PARTIAL',
        receivedAt: complete ? new Date() : purchase.receivedAt,
        notes: dto.notes ?? purchase.notes,
      },
      include: { lines: true },
    });
    await this.audit.tenant(auth, {
      action: complete ? 'PURCHASE_RECEIVED' : 'PURCHASE_PARTIALLY_RECEIVED',
      entityType: 'Purchase',
      entityId: id,
      after: { status: updated.status },
      ip,
    });
    return updated;
  }
}
