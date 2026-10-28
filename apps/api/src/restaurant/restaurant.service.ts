import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeLine, dec, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { StockService } from '../inventory/stock.service';
import { SalesService } from '../sales/sales.service';
import type { AuthContext } from '../common/guards';
import {
  CancelItemDto,
  CancelOrderDto,
  CreateAreaDto,
  CreateTableDto,
  OpenOrderDto,
  OrderItemDto,
  PayOrderDto,
  RestaurantQueryDto,
  SplitOrderDto,
} from './restaurant.dto';

@Injectable()
export class RestaurantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly stock: StockService,
    private readonly sales: SalesService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new NotFoundException('Contexto de tienda requerido.');
    return id;
  }

  async areas() {
    return this.db.restaurantArea.findMany({
      where: { tenantId: this.tenant(), active: true },
      include: {
        tables: { orderBy: { name: 'asc' } },
        branch: { select: { name: true } },
      },
      orderBy: { sort: 'asc' },
    });
  }

  async createArea(auth: AuthContext, dto: CreateAreaDto, ip?: string) {
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId: this.tenant() },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    const area = await this.db.restaurantArea.create({
      data: {
        tenantId: this.tenant(),
        branchId: dto.branchId,
        name: dto.name,
        sort: dto.sort ?? 0,
      },
    });
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_AREA_CREATED',
      entityType: 'RestaurantArea',
      entityId: area.id,
      after: { name: dto.name },
      ip,
    });
    return area;
  }

  async createTable(auth: AuthContext, dto: CreateTableDto, ip?: string) {
    const area = await this.db.restaurantArea.findFirst({
      where: { id: dto.areaId, tenantId: this.tenant() },
    });
    if (!area) throw new BadRequestException('Área inválida.');
    const table = await this.db.restaurantTable.create({
      data: {
        tenantId: this.tenant(),
        areaId: dto.areaId,
        name: dto.name,
        seats: dto.seats ?? 4,
      },
    });
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_TABLE_CREATED',
      entityType: 'RestaurantTable',
      entityId: table.id,
      after: { name: dto.name, areaId: dto.areaId },
      ip,
    });
    return table;
  }

  async orders(query: RestaurantQueryDto) {
    return this.db.restaurantOrder.findMany({
      where: {
        tenantId: this.tenant(),
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.tableId ? { tableId: query.tableId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: {
        table: { include: { area: true } },
        items: true,
        _count: { select: { items: true, splits: true } },
      },
    });
  }

  async kitchen() {
    return this.db.restaurantOrder.findMany({
      where: {
        tenantId: this.tenant(),
        status: { in: ['SENT', 'PREPARING', 'READY'] },
      },
      orderBy: { openedAt: 'asc' },
      include: {
        table: { select: { name: true } },
        items: {
          where: { status: { notIn: ['CANCELLED', 'SERVED'] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async order(id: string) {
    const order = await this.db.restaurantOrder.findFirst({
      where: { id, tenantId: this.tenant() },
      include: {
        table: { include: { area: true } },
        items: true,
        splits: { include: { items: true } },
        parent: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return order;
  }

  async open(auth: AuthContext, dto: OpenOrderDto, ip?: string) {
    const tenantId = this.tenant();
    if (auth.branchId && auth.branchId !== dto.branchId) {
      throw new ForbiddenException('No puede abrir pedidos en otra sucursal.');
    }
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    let table = null;
    if (dto.tableId) {
      table = await this.db.restaurantTable.findFirst({
        where: { id: dto.tableId, tenantId },
      });
      if (!table) throw new BadRequestException('Mesa inválida.');
      if (table.status === 'OCCUPIED') {
        throw new ConflictException('La mesa ya tiene un pedido abierto.');
      }
    }
    const seq = await this.sequence.next(tenantId, 'RESTAURANT_ORDER');
    const order = await this.db.restaurantOrder.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        tableId: dto.tableId,
        number: this.sequence.format('PED', seq),
        type: dto.type,
        guestCount: dto.guestCount ?? 1,
        notes: dto.notes,
        openedById: auth.userId,
      },
    });
    if (table) {
      await this.db.restaurantTable.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED', currentOrderId: order.id },
      });
    }
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ORDER_OPENED',
      entityType: 'RestaurantOrder',
      entityId: order.id,
      after: { number: order.number, tableId: dto.tableId, type: dto.type },
      ip,
    });
    return order;
  }

  private async recalc(orderId: string) {
    const order = await this.db.restaurantOrder.findFirst({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    let subtotal = dec(0);
    let tax = dec(0);
    let total = dec(0);
    for (const item of order.items) {
      if (item.status === 'CANCELLED') continue;
      const computed = computeLine({
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
      });
      subtotal = subtotal.plus(computed.gross);
      tax = tax.plus(computed.tax);
      total = total.plus(computed.total);
    }
    return this.db.restaurantOrder.update({
      where: { id: orderId },
      data: {
        subtotal: roundMoney(subtotal),
        tax: roundMoney(tax),
        total: roundMoney(total),
      },
    });
  }

  async addItem(auth: AuthContext, orderId: string, dto: OrderItemDto, ip?: string) {
    const tenantId = this.tenant();
    const order = await this.db.restaurantOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    if (!['OPEN', 'SENT', 'PREPARING', 'READY', 'SERVED'].includes(order.status)) {
      throw new ConflictException('El pedido no admite nuevos productos.');
    }
    const product = await this.db.product.findFirst({
      where: { id: dto.productId, tenantId, active: true },
      include: { tax: true, variants: true },
    });
    if (!product) throw new BadRequestException('Producto inválido.');
    let unitPrice = product.price.toString();
    if (dto.variantId) {
      const variant = product.variants.find((v) => v.id === dto.variantId && v.active);
      if (!variant) throw new BadRequestException('Variante inválida.');
      if (variant.priceOverride) unitPrice = variant.priceOverride.toString();
    }
    const computed = computeLine({
      quantity: dto.quantity,
      unitPrice,
      taxRate: product.tax?.rate.toString() ?? '0',
    });
    const item = await this.db.orderItem.create({
      data: {
        tenantId,
        orderId,
        productId: product.id,
        variantId: dto.variantId,
        name: product.name,
        quantity: computed.quantity,
        unitPrice: computed.unitPrice,
        taxRate: product.tax?.rate.toString() ?? '0',
        lineTotal: computed.total,
        modifiers: (dto.modifiers ?? []) as never,
        notes: dto.notes,
      },
    });
    await this.recalc(orderId);
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ITEM_ADDED',
      entityType: 'OrderItem',
      entityId: item.id,
      after: { product: product.name, quantity: dto.quantity },
      ip,
    });
    return item;
  }

  private async deductOrder(orderId: string, userId: string) {
    const tenantId = this.tenant();
    const order = await this.db.restaurantOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { where: { inventoryDeducted: false, status: { not: 'CANCELLED' } } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    const warehouse = await this.db.warehouse.findFirst({
      where: { tenantId, branchId: order.branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) throw new BadRequestException('La sucursal no tiene bodega configurada.');
    for (const item of order.items) {
      const product = await this.db.product.findFirst({
        where: { id: item.productId, tenantId },
        include: { recipes: true },
      });
      if (!product) continue;
      if (!product.trackInventory) {
        await this.db.orderItem.update({
          where: { id: item.id },
          data: { inventoryDeducted: true },
        });
        continue;
      }
      if (product.recipes.length) {
        for (const ingredient of product.recipes) {
          const ingredientProduct = await this.db.product.findFirst({
            where: { id: ingredient.ingredientProductId, tenantId },
          });
          if (!ingredientProduct) continue;
          await this.stock.apply({
            warehouseId: warehouse.id,
            productId: ingredient.ingredientProductId,
            quantity: dec(ingredient.quantity).times(item.quantity.toString()).negated().toString(),
            unitCost: ingredientProduct.cost.toString(),
            type: 'SALE',
            referenceType: 'RESTAURANT_ORDER',
            referenceId: order.id,
            reason: `Comanda ${order.number}`,
            userId,
            productName: ingredientProduct.name,
          });
        }
      } else {
        await this.stock.apply({
          warehouseId: warehouse.id,
          productId: product.id,
          variantId: item.variantId,
          quantity: dec(item.quantity.toString()).negated().toString(),
          unitCost: product.cost.toString(),
          type: 'SALE',
          referenceType: 'RESTAURANT_ORDER',
          referenceId: order.id,
          reason: `Comanda ${order.number}`,
          userId,
          productName: product.name,
        });
      }
      await this.db.orderItem.update({
        where: { id: item.id },
        data: { inventoryDeducted: true },
      });
    }
  }

  async send(auth: AuthContext, orderId: string, ip?: string) {
    const order = await this.order(orderId);
    if (['PAID', 'CANCELLED'].includes(order.status)) {
      throw new ConflictException('El pedido está cerrado.');
    }
    await this.deductOrder(orderId, auth.userId);
    await this.db.orderItem.updateMany({
      where: { orderId, tenantId: this.tenant(), status: 'PENDING' },
      data: { status: 'PENDING' },
    });
    const updated = await this.db.restaurantOrder.update({
      where: { id: orderId },
      data: { status: 'SENT' },
    });
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ORDER_SENT',
      entityType: 'RestaurantOrder',
      entityId: orderId,
      after: { status: 'SENT' },
      ip,
    });
    return updated;
  }

  async updateItemStatus(
    auth: AuthContext,
    orderId: string,
    itemId: string,
    status: string,
    ip?: string,
  ) {
    if (status === 'CANCELLED') {
      throw new BadRequestException('Use la anulación con motivo para cancelar una línea.');
    }
    const item = await this.db.orderItem.findFirst({
      where: { id: itemId, orderId, tenantId: this.tenant() },
    });
    if (!item) throw new NotFoundException('Línea no encontrada.');
    const updated = await this.db.orderItem.update({
      where: { id: itemId },
      data: { status: status as never },
    });
    const items = await this.db.orderItem.findMany({
      where: { orderId, tenantId: this.tenant(), status: { not: 'CANCELLED' } },
    });
    let orderStatus: 'PREPARING' | 'READY' | 'SERVED' | 'SENT' = 'SENT';
    if (items.length && items.every((i) => i.status === 'SERVED')) orderStatus = 'SERVED';
    else if (items.length && items.every((i) => ['READY', 'SERVED'].includes(i.status)))
      orderStatus = 'READY';
    else if (items.some((i) => i.status === 'PREPARING')) orderStatus = 'PREPARING';
    await this.db.restaurantOrder.update({
      where: { id: orderId },
      data: { status: orderStatus },
    });
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ITEM_STATUS',
      entityType: 'OrderItem',
      entityId: itemId,
      after: { status },
      ip,
    });
    return updated;
  }

  async split(auth: AuthContext, orderId: string, dto: SplitOrderDto, ip?: string) {
    const tenantId = this.tenant();
    const order = await this.order(orderId);
    if (order.parentOrderId) throw new ConflictException('No se puede dividir una cuenta hija.');
    if (!dto.itemIds.length) throw new BadRequestException('Seleccione líneas para separar.');
    const items = order.items.filter((item) => dto.itemIds.includes(item.id));
    if (items.length !== dto.itemIds.length) {
      throw new BadRequestException('Alguna línea no pertenece al pedido.');
    }
    if (items.length === order.items.length) {
      throw new BadRequestException('El pedido debe conservar al menos una línea.');
    }
    const seq = await this.sequence.next(tenantId, 'RESTAURANT_ORDER');
    const child = await this.db.restaurantOrder.create({
      data: {
        tenantId,
        branchId: order.branchId,
        tableId: order.tableId,
        number: this.sequence.format('PED', seq),
        type: order.type,
        guestCount: 1,
        parentOrderId: order.id,
        openedById: auth.userId,
      },
    });
    await this.db.orderItem.updateMany({
      where: { id: { in: items.map((i) => i.id) }, tenantId },
      data: { orderId: child.id },
    });
    await this.recalc(order.id);
    await this.recalc(child.id);
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ORDER_SPLIT',
      entityType: 'RestaurantOrder',
      entityId: order.id,
      after: { childId: child.id, itemIds: dto.itemIds },
      ip,
    });
    return { parent: await this.recalc(order.id), child: await this.recalc(child.id) };
  }

  async pay(
    auth: AuthContext,
    orderId: string,
    dto: PayOrderDto,
    idempotencyKey?: string,
    ip?: string,
  ) {
    const order = await this.order(orderId);
    if (order.status === 'PAID') throw new ConflictException('El pedido ya fue cobrado.');
    if (order.status === 'CANCELLED') throw new ConflictException('El pedido está anulado.');
    await this.deductOrder(orderId, auth.userId);
    const sale = await this.sales.create(
      auth,
      {
        branchId: order.branchId,
        registerId: dto.registerId,
        cashSessionId: dto.cashSessionId,
        customerId: dto.customerId,
        saleType: dto.tip && Number(dto.tip) > 0 ? 'SALE' : 'SALE',
        items: order.items
          .filter((item) => item.status !== 'CANCELLED')
          .map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
          })),
        payments: dto.payments,
        tip: dto.tip,
        tipAccepted: dto.tipAccepted,
        notes: order.notes ?? undefined,
      },
      {
        idempotencyKey,
        skipInventory: true,
        allowPriceOverride: true,
        internalSaleType: 'RESTAURANT',
        restaurantOrderId: order.id,
      },
    );
    const updated = await this.db.restaurantOrder.update({
      where: { id: orderId },
      data: { status: 'PAID', saleId: sale.id, closedAt: new Date() },
    });
    if (order.tableId) {
      const open = await this.db.restaurantOrder.count({
        where: {
          tenantId: this.tenant(),
          tableId: order.tableId,
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
      });
      if (open === 0) {
        await this.db.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'FREE', currentOrderId: null },
        });
      }
    }
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ORDER_PAID',
      entityType: 'RestaurantOrder',
      entityId: orderId,
      after: { saleId: sale.id, total: sale.total?.toString?.() ?? order.total.toString() },
      ip,
    });
    return { order: updated, sale };
  }

  private async restoreItems(
    orderId: string,
    items: Array<{ id: string; productId: string; variantId: string | null; quantity: Prisma.Decimal; inventoryDeducted: boolean }>,
    waste: boolean,
    reason: string,
    userId: string,
  ) {
    if (waste) return;
    const tenantId = this.tenant();
    const order = await this.db.restaurantOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) return;
    const warehouse = await this.db.warehouse.findFirst({
      where: { tenantId, branchId: order.branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) return;
    for (const item of items) {
      if (!item.inventoryDeducted) continue;
      const product = await this.db.product.findFirst({
        where: { id: item.productId, tenantId },
        include: { recipes: true },
      });
      if (!product || !product.trackInventory) continue;
      if (product.recipes.length) {
        for (const ingredient of product.recipes) {
          const ingredientProduct = await this.db.product.findFirst({
            where: { id: ingredient.ingredientProductId, tenantId },
          });
          if (!ingredientProduct) continue;
          await this.stock.apply({
            warehouseId: warehouse.id,
            productId: ingredient.ingredientProductId,
            quantity: dec(ingredient.quantity).times(item.quantity.toString()).toString(),
            unitCost: ingredientProduct.cost.toString(),
            type: 'RETURN',
            referenceType: 'RESTAURANT_ORDER',
            referenceId: orderId,
            reason,
            userId,
            productName: ingredientProduct.name,
          });
        }
      } else {
        await this.stock.apply({
          warehouseId: warehouse.id,
          productId: product.id,
          variantId: item.variantId,
          quantity: item.quantity.toString(),
          unitCost: product.cost.toString(),
          type: 'RETURN',
          referenceType: 'RESTAURANT_ORDER',
          referenceId: orderId,
          reason,
          userId,
          productName: product.name,
        });
      }
    }
  }

  async cancelItem(
    auth: AuthContext,
    orderId: string,
    itemId: string,
    dto: CancelItemDto,
    ip?: string,
  ) {
    const item = await this.db.orderItem.findFirst({
      where: { id: itemId, orderId, tenantId: this.tenant() },
    });
    if (!item) throw new NotFoundException('Línea no encontrada.');
    if (item.status === 'CANCELLED') return item;
    const waste = dto.waste ?? true;
    await this.restoreItems(orderId, [item], waste, dto.reason, auth.userId);
    const updated = await this.db.orderItem.update({
      where: { id: itemId },
      data: { status: 'CANCELLED', inventoryDeducted: false },
    });
    await this.recalc(orderId);
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ITEM_CANCELLED',
      entityType: 'OrderItem',
      entityId: itemId,
      reason: dto.reason,
      after: { waste },
      ip,
    });
    return updated;
  }

  async cancelOrder(
    auth: AuthContext,
    orderId: string,
    dto: CancelOrderDto,
    ip?: string,
  ) {
    const order = await this.order(orderId);
    if (order.status === 'PAID') throw new ConflictException('Un pedido pagado no se anula.');
    const waste = dto.waste ?? true;
    await this.restoreItems(order.id, order.items, waste, dto.reason, auth.userId);
    await this.db.orderItem.updateMany({
      where: { orderId, tenantId: this.tenant(), status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', inventoryDeducted: false },
    });
    const updated = await this.db.restaurantOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', closedAt: new Date(), total: 0, subtotal: 0, tax: 0 },
    });
    if (order.tableId) {
      const open = await this.db.restaurantOrder.count({
        where: {
          tenantId: this.tenant(),
          tableId: order.tableId,
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
      });
      if (open === 0) {
        await this.db.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'FREE', currentOrderId: null },
        });
      }
    }
    await this.audit.tenant(auth, {
      action: 'RESTAURANT_ORDER_CANCELLED',
      entityType: 'RestaurantOrder',
      entityId: orderId,
      reason: dto.reason,
      after: { waste, restock: dto.restock },
      ip,
    });
    return updated;
  }
}
