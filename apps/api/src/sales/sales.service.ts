import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  changeDue,
  computeLine,
  dec,
  remainingBalance,
  roundMoney,
} from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { StockService } from '../inventory/stock.service';
import { StorageService } from '../common/storage.service';
import { uuid } from '../common/security';
import type { AuthContext } from '../common/guards';
import type { ReceiptItem, ReceiptPayment, ReceiptSnapshot } from './receipt.types';
import type { CreateReturnDto, CreateSaleDto, SalesQueryDto } from './sales.dto';
import { ReceiptService } from './receipt.service';
import { AccountingService } from '../accounting/accounting.service';

interface PreparedLine {
  product: {
    id: string;
    name: string;
    sku: string;
    price: Prisma.Decimal;
    wholesalePrice: Prisma.Decimal | null;
    wholesaleMinQty: Prisma.Decimal;
    cost: Prisma.Decimal;
    trackInventory: boolean;
    type: string;
    tax: { rate: Prisma.Decimal } | null;
    unit: { allowDecimal: boolean };
    recipes: Array<{ ingredientProductId: string; quantity: Prisma.Decimal }>;
  };
  variantId: string | null;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  gross: string;
  unitCost: string;
  description: string;
  sku: string;
  lotCode: string | null;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly stock: StockService,
    private readonly receipts: ReceiptService,
    private readonly storage: StorageService,
    private readonly accounting: AccountingService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new NotFoundException('Contexto de tienda requerido.');
    return id;
  }

  private async prepareLines(
    auth: AuthContext,
    branchId: string,
    items: CreateSaleDto['items'],
    allowPriceOverride = false,
  ): Promise<PreparedLine[]> {
    const tenantId = this.tenant();
    if (!items.length) throw new BadRequestException('La venta no tiene productos.');
    const ids = Array.from(new Set(items.map((item) => item.productId)));
    const products = await this.db.product.findMany({
      where: { tenantId, id: { in: ids } },
      include: {
        tax: true,
        unit: true,
        variants: true,
        recipes: { include: { ingredient: true } },
      },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    let branchWarehouse = await this.db.warehouse.findFirst({
      where: { tenantId, branchId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branchWarehouse) {
      const branch = await this.db.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) throw new BadRequestException('Sucursal inválida.');
      branchWarehouse = await this.db.warehouse.findFirst({
        where: { tenantId, branchId },
      });
    }
    if (!branchWarehouse) {
      throw new BadRequestException('La sucursal no tiene una bodega configurada.');
    }
    const canDiscount = auth.permissions.includes('sales.discount') || auth.readOnly;
    const prepared: PreparedLine[] = [];
    for (const item of items) {
      const product = map.get(item.productId);
      if (!product || !product.active) {
        throw new BadRequestException('Producto inexistente o inactivo.');
      }
      const quantity = dec(item.quantity);
      if (!quantity.isFinite() || quantity.lte(0)) {
        throw new BadRequestException('Cantidad inválida.');
      }
      if (!product.unit.allowDecimal && !quantity.isInteger()) {
        throw new BadRequestException(
          `${product.name} se vende por unidad; la cantidad debe ser entera.`,
        );
      }
      let variantId: string | null = null;
      if (item.variantId) {
        const variant = product.variants.find(
          (v) => v.id === item.variantId && v.active,
        );
        if (!variant) throw new BadRequestException('Variante inválida.');
        variantId = variant.id;
      } else if (product.type === 'VARIANT') {
        throw new BadRequestException(`Seleccione talla/color para ${product.name}.`);
      }
      const variant = variantId
        ? product.variants.find((v) => v.id === variantId)
        : null;
      let unitPrice = dec(variant?.priceOverride ?? product.price);
      if (
        product.wholesalePrice &&
        quantity.gte(product.wholesaleMinQty)
      ) {
        unitPrice = dec(product.wholesalePrice);
      }
      if (item.unitPrice !== undefined && item.unitPrice !== '') {
        const requested = dec(item.unitPrice);
        if (!requested.equals(unitPrice)) {
          if (!canDiscount && !allowPriceOverride) {
            throw new ForbiddenException({
              code: 'DISCOUNT_NOT_AUTHORIZED',
              message: 'El cambio de precio requiere autorización de descuentos.',
            });
          }
          unitPrice = requested;
        }
      }
      const discountPercent = dec(item.discountPercent ?? 0);
      const discountAmount = dec(item.discountAmount ?? 0);
      if ((discountPercent.gt(0) || discountAmount.gt(0)) && !canDiscount && !allowPriceOverride) {
        throw new ForbiddenException({
          code: 'DISCOUNT_NOT_AUTHORIZED',
          message: 'No tiene permiso para aplicar descuentos.',
        });
      }
      const taxRate = (product.tax?.rate ?? dec(0)).toString();
      const computed = computeLine({
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        discountPercent: discountPercent.toString(),
        discountAmount: discountAmount.toString(),
        taxRate,
      });
      let warehouseId = item.warehouseId ?? branchWarehouse.id;
      if (item.warehouseId) {
        const wh = await this.db.warehouse.findFirst({
          where: { id: item.warehouseId, tenantId, branchId },
        });
        if (!wh) throw new BadRequestException('Bodega inválida para la sucursal.');
      }
      prepared.push({
        product: {
          ...product,
          recipes: product.recipes.map((r) => ({
            ingredientProductId: r.ingredientProductId,
            quantity: r.quantity,
          })),
        },
        variantId,
        warehouseId,
        quantity: computed.quantity,
        unitPrice: computed.unitPrice,
        discount: computed.discount,
        taxRate,
        taxAmount: computed.tax,
        total: computed.total,
        gross: computed.gross,
        unitCost: product.cost.toString(),
        description: product.name,
        sku: variant?.sku ? `${product.sku} / ${variant.sku}` : product.sku,
        lotCode: item.lotCode ?? null,
      });
    }
    return prepared;
  }

  async create(
    auth: AuthContext,
    dto: CreateSaleDto,
    options: {
      idempotencyKey?: string;
      skipInventory?: boolean;
      allowPriceOverride?: boolean;
      internalSaleType?: 'SALE' | 'CREDIT' | 'QUOTE' | 'RESTAURANT';
      restaurantOrderId?: string;
    } = {},
  ): Promise<any> {
    const tenantId = this.tenant();
    const key = options.idempotencyKey ?? dto.idempotencyKey;
    if (key) {
      await this.db.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1), 42)',
        `${tenantId}:${key}`,
      );
      const existing = await this.db.idempotencyRecord.findUnique({
        where: { tenantId_scope_key: { tenantId, scope: 'sale', key } },
      });
      if (existing?.response) return existing.response;
    }

    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    if (auth.branchId && auth.branchId !== dto.branchId) {
      throw new ForbiddenException('No puede vender en una sucursal distinta a la asignada.');
    }
    const register = dto.registerId
      ? await this.db.register.findFirst({
          where: { id: dto.registerId, tenantId, branchId: dto.branchId },
        })
      : null;
    if (dto.registerId && !register) throw new BadRequestException('Caja inválida.');
    const customer = dto.customerId
      ? await this.db.customer.findFirst({
          where: { id: dto.customerId, tenantId, active: true },
        })
      : null;
    if (dto.customerId && !customer) throw new BadRequestException('Cliente inválido.');
    const prepared = await this.prepareLines(
      auth,
      dto.branchId,
      dto.items,
      options.allowPriceOverride,
    );
    const totals = prepared.reduce(
      (acc, line) => {
        acc.subtotal = acc.subtotal.plus(line.gross);
        acc.discount = acc.discount.plus(line.discount);
        acc.tax = acc.tax.plus(line.taxAmount);
        acc.total = acc.total.plus(line.total);
        return acc;
      },
      {
        subtotal: dec(0),
        discount: dec(0),
        tax: dec(0),
        total: dec(0),
      },
    );
    const tip = dec(dto.tip ?? 0);
    if (tip.gt(0) && !dto.tipAccepted) {
      throw new BadRequestException(
        'La propina solo se agrega con aceptación explícita del cliente.',
      );
    }
    let paid = dec(0);
    let tipsPaid = dec(0);
    for (const payment of dto.payments) {
      if (payment.method === 'CREDIT') {
        throw new BadRequestException('El crédito no se registra como medio de pago.');
      }
      const amount = dec(payment.amount);
      if (amount.lt(0)) throw new BadRequestException('Pago inválido.');
      paid = paid.plus(amount);
      const paymentTip = dec(payment.tip ?? 0);
      tipsPaid = tipsPaid.plus(paymentTip);
      if (payment.method === 'CASH' && payment.received !== undefined) {
        if (dec(payment.received).lt(amount)) {
          throw new BadRequestException('El efectivo recibido es menor al pago.');
        }
      }
    }
    if (tip.gt(0) && !tipsPaid.equals(tip)) {
      throw new BadRequestException('La propina debe quedar incluida en los pagos.');
    }
    if (paid.gt(totals.total.plus(0.001))) {
      throw new BadRequestException('Los pagos superan el total de la venta.');
    }
    const balance = remainingBalance(totals.total.toString(), paid.toString());
    const isCredit = balance !== '0.00';
    if (isCredit) {
      if (!customer) throw new BadRequestException('Seleccione un cliente para la venta a crédito.');
      if (dec(customer.creditLimit).lte(0)) {
        throw new BadRequestException('El cliente no tiene cupo de crédito configurado.');
      }
      const open = await this.db.receivable.aggregate({
        where: { tenantId, customerId: customer.id, status: { in: ['OPEN', 'PARTIAL'] } },
        _sum: { balance: true },
      });
      const used = dec(open._sum.balance ?? 0);
      if (used.plus(balance).gt(customer.creditLimit)) {
        throw new BadRequestException('La venta supera el cupo de crédito disponible.');
      }
    }
    if (options.internalSaleType === 'CREDIT') {
      if (!isCredit) throw new BadRequestException('La venta a crédito requiere saldo pendiente.');
    }
    const cashPayments = dto.payments.filter((p) => p.method === 'CASH');
    let cashSession = null;
    if (cashPayments.length) {
      if (!register) {
        throw new BadRequestException('Seleccione una caja para recibir efectivo.');
      }
      if (dto.cashSessionId) {
        cashSession = await this.db.cashSession.findFirst({
          where: {
            id: dto.cashSessionId,
            tenantId,
            registerId: register.id,
            status: 'OPEN',
          },
        });
      } else {
        cashSession = await this.db.cashSession.findFirst({
          where: { tenantId, registerId: register.id, status: 'OPEN' },
        });
      }
      if (!cashSession) {
        throw new BadRequestException(
          'Debe abrir la caja antes de recibir pagos en efectivo.',
        );
      }
    }

    const seq = await this.sequence.next(tenantId, 'SALE');
    const number = this.sequence.format('V', seq);
    const saleType =
      options.internalSaleType ??
      (isCredit ? 'CREDIT' : dto.saleType === 'QUOTE' ? 'QUOTE' : 'SALE');
    const saleRecord = await this.db.sale.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        registerId: register?.id,
        cashSessionId: cashSession?.id,
        customerId: customer?.id,
        number,
        status: 'CONFIRMED',
        type: saleType as never,
        subtotal: roundMoney(totals.subtotal),
        discount: roundMoney(totals.discount),
        tax: roundMoney(totals.tax),
        total: roundMoney(totals.total),
        paid: roundMoney(paid),
        balance,
        tip: roundMoney(tip),
        notes: dto.notes,
        soldById: auth.userId,
        idempotencyKey: key,
        restaurantOrderId: options.restaurantOrderId,
        confirmedAt: new Date(),
      },
    });
    await this.db.saleLine.createMany({
      data: prepared.map((line) => ({
        tenantId,
        saleId: saleRecord.id,
        productId: line.product.id,
        variantId: line.variantId,
        warehouseId: line.warehouseId,
        description: line.description,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
        taxAmount: line.taxAmount,
        lineTotal: line.total,
        unitCost: line.unitCost,
        trackInventory: line.product.trackInventory,
        recipeSnapshot: line.product.recipes.length
          ? (line.product.recipes as unknown as Prisma.InputJsonValue)
          : undefined,
      })),
    });
    await this.db.payment.createMany({
      data: dto.payments.map((payment) => ({
        tenantId,
        saleId: saleRecord.id,
        method: payment.method as never,
        status: 'APPROVED',
        amount: payment.amount,
        tip: payment.tip ?? '0',
        received: payment.received,
        change:
          payment.method === 'CASH' && payment.received
            ? changeDue(payment.received, payment.amount)
            : null,
        reference: payment.reference,
        createdById: auth.userId,
      })),
    });
    const sale = await this.db.sale.findFirstOrThrow({
      where: { id: saleRecord.id },
      include: {
        lines: true,
        payments: true,
        customer: true,
        branch: true,
        register: true,
      },
    });

    if (!options.skipInventory) {
      for (const line of prepared) {
        if (!line.product.trackInventory) continue;
        if (line.product.type === 'RECIPE' && line.product.recipes.length) {
          for (const ingredient of line.product.recipes) {
            const ingredientProduct = await this.db.product.findFirst({
              where: { id: ingredient.ingredientProductId, tenantId },
            });
            if (!ingredientProduct) continue;
            await this.stock.apply({
              warehouseId: line.warehouseId,
              productId: ingredient.ingredientProductId,
              quantity: dec(ingredient.quantity).times(line.quantity).toString(),
              unitCost: ingredientProduct.cost.toString(),
              type: 'SALE',
              referenceType: 'SALE',
              referenceId: sale.id,
              reason: `Consumo receta ${line.description}`,
              userId: auth.userId,
              productName: ingredientProduct.name,
            });
          }
        } else {
          await this.stock.apply({
            warehouseId: line.warehouseId,
            productId: line.product.id,
            variantId: line.variantId,
            lotCode: line.lotCode,
            quantity: `-${line.quantity}`,
            unitCost: line.unitCost,
            type: 'SALE',
            referenceType: 'SALE',
            referenceId: sale.id,
            reason: `Venta ${number}`,
            userId: auth.userId,
            productName: line.description,
          });
        }
      }
    }

    if (cashSession) {
      for (const payment of dto.payments.filter((p) => p.method === 'CASH')) {
        const amount = dec(payment.amount).plus(dec(payment.tip ?? 0));
        if (amount.gt(0)) {
          await this.db.cashMovement.create({
            data: {
              tenantId,
              cashSessionId: cashSession.id,
              type: 'SALE',
              amount: roundMoney(amount),
              referenceType: 'SALE',
              referenceId: sale.id,
              description: `Venta ${number}`,
              createdById: auth.userId,
            },
          });
        }
      }
    }

    let receivable = null;
    if (isCredit && customer) {
      receivable = await this.db.receivable.create({
        data: {
          tenantId,
          customerId: customer.id,
          saleId: sale.id,
          originalAmount: roundMoney(totals.total),
          paidAmount: roundMoney(paid),
          balance,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: paid.gt(0) ? 'PARTIAL' : 'OPEN',
        },
      });
    }

    await this.accounting.postSale(auth, sale);
    const store = await this.prisma.store.findUnique({ where: { id: tenantId } });
    const snapshot = this.snapshot({
      sale,
      store: store!,
      branch,
      register,
      customer,
      lines: sale.lines,
      payments: sale.payments,
      cashierName: auth.fullName,
      copy: false,
    });
    await this.db.sale.update({
      where: { id: sale.id },
      data: { receiptSnapshot: snapshot as never },
    });
    if (key) {
      await this.db.idempotencyRecord.create({
        data: {
          tenantId,
          scope: 'sale',
          key,
          response: JSON.parse(JSON.stringify({ ...sale, receipt: snapshot, receivable })) as never,
        },
      });
    }
    await this.audit.tenant(auth, {
      action: 'SALE_CONFIRMED',
      entityType: 'Sale',
      entityId: sale.id,
      after: { number, total: snapshot.total, type: saleType },
    });
    return { ...sale, receiptSnapshot: snapshot, receipt: snapshot, receivable };
  }

  private snapshot(input: {
    sale: {
      number: string;
      createdAt: Date;
      currency: string;
      subtotal: Prisma.Decimal;
      discount: Prisma.Decimal;
      tax: Prisma.Decimal;
      total: Prisma.Decimal;
      tip: Prisma.Decimal;
      paid: Prisma.Decimal;
      balance: Prisma.Decimal;
      notes: string | null;
      status: string;
    };
    store: {
      id: string;
      name: string;
      legalName: string | null;
      taxId: string | null;
      address: string;
      city: string;
      phone: string;
      email: string;
      logoKey: string | null;
    };
    branch: { name: string } | null;
    register: { name: string } | null;
    customer: { name: string; taxId: string | null } | null;
    lines: Array<{
      description: string;
      sku: string | null;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      discount: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    payments: Array<{
      method: string;
      amount: Prisma.Decimal;
      tip: Prisma.Decimal;
      received: Prisma.Decimal | null;
      change: Prisma.Decimal | null;
      reference: string | null;
    }>;
    cashierName: string;
    copy: boolean;
  }): ReceiptSnapshot {
    const items: ReceiptItem[] = input.lines.map((line) => ({
      description: line.description,
      sku: line.sku,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      discount: line.discount.toString(),
      taxRate: line.taxRate.toString(),
      taxAmount: line.taxAmount.toString(),
      total: line.lineTotal.toString(),
    }));
    const payments: ReceiptPayment[] = input.payments.map((p) => ({
      method: p.method,
      amount: p.amount.toString(),
      tip: p.tip.toString(),
      received: p.received?.toString() ?? null,
      change: p.change?.toString() ?? null,
      reference: p.reference,
    }));
    return {
      version: 1,
      number: input.sale.number,
      date: input.sale.createdAt.toISOString(),
      copy: input.copy,
      currency: input.sale.currency,
      store: {
        id: input.store.id,
        name: input.store.name,
        legalName: input.store.legalName,
        taxId: input.store.taxId,
        address: input.store.address,
        city: input.store.city,
        phone: input.store.phone,
        email: input.store.email,
        logoFileId: input.store.logoKey,
      },
      branch: input.branch ? { name: input.branch.name } : null,
      register: input.register ? { name: input.register.name } : null,
      cashier: { name: input.cashierName },
      customer: input.customer
        ? { name: input.customer.name, taxId: input.customer.taxId }
        : null,
      items,
      subtotal: input.sale.subtotal.toString(),
      discount: input.sale.discount.toString(),
      tax: input.sale.tax.toString(),
      total: input.sale.total.toString(),
      tip: input.sale.tip.toString(),
      paid: input.sale.paid.toString(),
      balance: input.sale.balance.toString(),
      payments,
      notes: input.sale.notes,
      fiscal: {
        electronic: false,
        legend:
          'Comprobante de venta. No es una factura electrónica validada por la DIAN.',
      },
      footer: 'Generado por Saldio POS',
    };
  }

  async list(auth: AuthContext, query: SalesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SaleWhereInput = {
      tenantId: this.tenant(),
      ...(auth.branchId
        ? { branchId: auth.branchId }
        : query.branchId
          ? { branchId: query.branchId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.sale.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true } },
          branch: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
      this.db.sale.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async get(id: string) {
    const sale = await this.db.sale.findFirst({
      where: { id, tenantId: this.tenant() },
      include: {
        lines: true,
        payments: true,
        returns: { include: { lines: true } },
        receivable: { include: { payments: true } },
        customer: true,
        branch: true,
        register: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    return sale;
  }

  async receipt(id: string, copy = false) {
    const sale = await this.get(id);
    const snapshot = (sale.receiptSnapshot ?? {}) as unknown as ReceiptSnapshot;
    if (!snapshot.number) throw new NotFoundException('Comprobante no disponible.');
    return {
      ...snapshot,
      copy,
      logoUrl:
        snapshot.store.logoFileId
          ? this.storage.signedUrl(snapshot.store.logoFileId, sale.tenantId, 30)
          : null,
    };
  }

  async markPrinted(id: string) {
    const sale = await this.db.sale.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    const copy = sale.printCount > 0;
    await this.db.sale.update({
      where: { id },
      data: { printCount: { increment: 1 } },
    });
    return this.receipt(id, copy);
  }

  async pdf(id: string, width: '58' | '80' | 'a4') {
    const snapshot = await this.receipt(id, false);
    return this.receipts.pdf(snapshot, width);
  }

  async createReturn(
    auth: AuthContext,
    saleId: string,
    dto: CreateReturnDto,
    ip?: string,
  ) {
    const tenantId = this.tenant();
    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { lines: true, returns: { include: { lines: true } }, receivable: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    if (sale.status === 'REFUNDED') throw new ConflictException('La venta ya fue devuelta.');
    if (!dto.lines.length) throw new BadRequestException('Agregue líneas a devolver.');
    const returnedByLine = new Map<string, number>();
    for (const ret of sale.returns) {
      for (const line of ret.lines) {
        returnedByLine.set(
          line.saleLineId,
          (returnedByLine.get(line.saleLineId) ?? 0) + Number(line.quantity),
        );
      }
    }
    let total = dec(0);
    const prepared: Array<{
      saleLineId: string;
      quantity: string;
      unitPrice: string;
      taxRate: string;
      total: string;
      base: string;
      tax: string;
      line: (typeof sale.lines)[number];
      restock: boolean;
    }> = [];
    for (const requested of dto.lines) {
      const line = sale.lines.find((l) => l.id === requested.saleLineId);
      if (!line) throw new BadRequestException('Línea de venta inválida.');
      const already = returnedByLine.get(line.id) ?? 0;
      const available = Number(line.quantity) - already;
      const quantity = Number(requested.quantity);
      if (quantity <= 0 || quantity > available + 0.0001) {
        throw new BadRequestException(
          `Cantidad inválida para ${line.description}. Disponible: ${available}.`,
        );
      }
      const unitDiscount = dec(line.discount).div(line.quantity);
      const computed = computeLine({
        quantity: requested.quantity,
        unitPrice: line.unitPrice.toString(),
        discountAmount: unitDiscount.times(quantity).toString(),
        taxRate: line.taxRate.toString(),
      });
      total = total.plus(computed.total);
      prepared.push({
        saleLineId: line.id,
        quantity: computed.quantity,
        unitPrice: line.unitPrice.toString(),
        taxRate: line.taxRate.toString(),
        total: computed.total,
        base: computed.taxableBase,
        tax: computed.tax,
        line,
        restock: requested.restock ?? !dto.waste,
      });
    }
    if (total.gt(dec(sale.total))) {
      throw new BadRequestException('La devolución supera el total de la venta.');
    }
    let cashSession = null;
    if (dto.refundMethod === 'CASH') {
      if (dto.cashSessionId) {
        cashSession = await this.db.cashSession.findFirst({
          where: { id: dto.cashSessionId, tenantId, status: 'OPEN' },
        });
      } else if (sale.registerId) {
        cashSession = await this.db.cashSession.findFirst({
          where: { tenantId, registerId: sale.registerId, status: 'OPEN' },
        });
      }
      if (!cashSession) {
        throw new BadRequestException(
          'Debe tener una caja abierta para devolver efectivo.',
        );
      }
    }
    const seq = await this.sequence.next(tenantId, 'RETURN');
    const retRecord = await this.db.return.create({
      data: {
        tenantId,
        saleId,
        number: this.sequence.format('D', seq),
        type: dto.type,
        reason: dto.reason,
        restock: dto.type === 'TOTAL' ? !dto.waste : prepared.some((p) => p.restock),
        subtotal: roundMoney(
          prepared.reduce((sum, p) => sum.plus(p.base), dec(0)),
        ),
        tax: roundMoney(prepared.reduce((sum, p) => sum.plus(p.tax), dec(0))),
        total: roundMoney(total),
        refundMethod: dto.refundMethod as never,
        waste: dto.waste ?? false,
        createdById: auth.userId,
      },
    });
    await this.db.returnLine.createMany({
      data: prepared.map((p) => ({
        tenantId,
        returnId: retRecord.id,
        saleLineId: p.saleLineId,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        taxRate: p.taxRate,
        total: p.total,
      })),
    });
    const ret = await this.db.return.findFirstOrThrow({
      where: { id: retRecord.id },
      include: { lines: true },
    });
    if (dto.refundMethod === 'CASH' && cashSession) {
      await this.db.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: cashSession.id,
          type: 'REFUND',
          amount: roundMoney(total.negated()),
          referenceType: 'RETURN',
          referenceId: ret.id,
          description: `Devolución ${ret.number}`,
          createdById: auth.userId,
        },
      });
    }
    for (const p of prepared) {
      if (!p.restock) continue;
      const line = p.line;
      if (!line.productId || !line.trackInventory) continue;
      const product = await this.db.product.findFirst({
        where: { id: line.productId, tenantId },
        include: { recipes: true },
      });
      if (!product) continue;
      if (product.recipes.length) {
        for (const ingredient of product.recipes) {
          const ingredientProduct = await this.db.product.findFirst({
            where: { id: ingredient.ingredientProductId, tenantId },
          });
          if (!ingredientProduct) continue;
          await this.stock.apply({
            warehouseId: line.warehouseId ?? sale.branchId,
            productId: ingredient.ingredientProductId,
            quantity: dec(ingredient.quantity).times(p.quantity).toString(),
            unitCost: ingredientProduct.cost.toString(),
            type: 'RETURN',
            referenceType: 'RETURN',
            referenceId: ret.id,
            reason: `Devolución ${ret.number}`,
            userId: auth.userId,
            productName: ingredientProduct.name,
          });
        }
      } else if (line.warehouseId) {
        await this.stock.apply({
          warehouseId: line.warehouseId,
          productId: line.productId,
          variantId: line.variantId,
          quantity: p.quantity,
          unitCost: line.unitCost.toString(),
          type: 'RETURN',
          referenceType: 'RETURN',
          referenceId: ret.id,
          reason: `Devolución ${ret.number}`,
          userId: auth.userId,
          productName: line.description,
        });
      }
    }
    const allLines = await this.db.saleLine.findMany({
      where: { saleId, tenantId },
    });
    const returned = await this.db.returnLine.groupBy({
      by: ['saleLineId'],
      where: { tenantId, return: { saleId } },
      _sum: { quantity: true },
    });
    const returnedMap = new Map(
      returned.map((r) => [r.saleLineId, Number(r._sum.quantity ?? 0)]),
    );
    const fully = allLines.every(
      (line) => (returnedMap.get(line.id) ?? 0) >= Number(line.quantity) - 0.0001,
    );
    await this.db.sale.update({
      where: { id: saleId },
      data: { status: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
    if (sale.receivable && dec(sale.receivable.balance).gt(0)) {
      const reduction = dec(total).lt(sale.receivable.balance)
        ? dec(total)
        : dec(sale.receivable.balance);
      const newBalance = dec(sale.receivable.balance).minus(reduction);
      await this.db.receivable.update({
        where: { id: sale.receivable.id },
        data: {
          balance: roundMoney(newBalance),
          originalAmount: roundMoney(
            dec(sale.receivable.originalAmount).minus(reduction),
          ),
          status: newBalance.isZero() ? 'PAID' : 'PARTIAL',
        },
      });
    }
    await this.audit.tenant(auth, {
      action: 'SALE_RETURNED',
      entityType: 'Return',
      entityId: ret.id,
      reason: dto.reason,
      after: { number: ret.number, total: ret.total.toString(), waste: dto.waste },
      ip,
    });
    return ret;
  }
}
