import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new Error('Contexto de tienda requerido');
    return id;
  }

  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return { start, end };
  }

  async dashboard() {
    const tenantId = this.tenant();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const week = new Date(start);
    week.setDate(week.getDate() - 6);
    const [today, cash, lowStock, receivables, recent, top, daily] = await Promise.all([
      this.db.sale.aggregate({
        where: {
          tenantId,
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED'] },
          createdAt: { gte: start },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.db.cashSession.findMany({
        where: { tenantId, status: 'OPEN' },
        include: { register: { select: { name: true } } },
      }),
      this.db.stockLevel.count({
        where: {
          tenantId,
          product: { reorderPoint: { not: null } },
        },
      }),
      this.db.receivable.aggregate({
        where: { tenantId, status: { in: ['OPEN', 'PARTIAL'] } },
        _sum: { balance: true },
      }),
      this.db.sale.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { customer: { select: { name: true } } },
      }),
      this.db.saleLine.groupBy({
        by: ['productId'],
        where: {
          tenantId,
          sale: { status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED'] }, createdAt: { gte: week } },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 5,
      }),
      this.db.sale.findMany({
        where: {
          tenantId,
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED'] },
          createdAt: { gte: week },
        },
        select: { createdAt: true, total: true },
      }),
    ]);
    const productIds = top.map((t) => t.productId).filter(Boolean) as string[];
    const products = productIds.length
      ? await this.db.product.findMany({
          where: { tenantId, id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(week);
      d.setDate(week.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const sale of daily) {
      const key = sale.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(sale.total));
    }
    const todayTotal = Number(today._sum.total ?? 0);
    return {
      today: {
        total: roundMoney(todayTotal),
        count: today._count._all,
        average: today._count._all ? roundMoney(todayTotal / today._count._all) : '0.00',
      },
      cashSessions: cash,
      lowStockProducts: lowStock,
      receivables: receivables._sum.balance?.toString() ?? '0',
      recentSales: recent,
      topProducts: top.map((t) => ({
        productId: t.productId,
        name: productMap.get(t.productId ?? '') ?? 'Producto',
        quantity: t._sum.quantity?.toString() ?? '0',
        total: t._sum.lineTotal?.toString() ?? '0',
      })),
      daily: [...byDay.entries()].map(([date, total]) => ({ date, total: roundMoney(total) })),
    };
  }

  async sales(from?: string, to?: string) {
    const tenantId = this.tenant();
    const { start, end } = this.range(from, to);
    const [sales, payments, returns] = await Promise.all([
      this.db.sale.findMany({
        where: {
          tenantId,
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED'] },
          createdAt: { gte: start, lte: end },
        },
        select: { createdAt: true, subtotal: true, discount: true, tax: true, total: true, tip: true },
      }),
      this.db.payment.groupBy({
        by: ['method'],
        where: {
          tenantId,
          sale: { createdAt: { gte: start, lte: end } },
        },
        _sum: { amount: true },
      }),
      this.db.return.aggregate({
        where: { tenantId, createdAt: { gte: start, lte: end } },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);
    const byDay = new Map<string, { total: number; count: number }>();
    for (const sale of sales) {
      const key = sale.createdAt.toISOString().slice(0, 10);
      const current = byDay.get(key) ?? { total: 0, count: 0 };
      current.total += Number(sale.total);
      current.count += 1;
      byDay.set(key, current);
    }
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      count: sales.length,
      gross: roundMoney(sales.reduce((sum, s) => sum + Number(s.subtotal), 0)),
      discount: roundMoney(sales.reduce((sum, s) => sum + Number(s.discount), 0)),
      tax: roundMoney(sales.reduce((sum, s) => sum + Number(s.tax), 0)),
      total: roundMoney(sales.reduce((sum, s) => sum + Number(s.total), 0)),
      tips: roundMoney(sales.reduce((sum, s) => sum + Number(s.tip), 0)),
      returns: returns._sum.total?.toString() ?? '0',
      returnsCount: returns._count._all,
      byPaymentMethod: payments.map((p) => ({
        method: p.method,
        total: p._sum.amount?.toString() ?? '0',
      })),
      byDay: [...byDay.entries()].sort().map(([date, value]) => ({
        date,
        total: roundMoney(value.total),
        count: value.count,
      })),
    };
  }

  async products(from?: string, to?: string) {
    const tenantId = this.tenant();
    const { start, end } = this.range(from, to);
    const groups = await this.db.saleLine.groupBy({
      by: ['productId', 'description'],
      where: {
        tenantId,
        sale: { createdAt: { gte: start, lte: end } },
      },
      _sum: { quantity: true, discount: true, taxAmount: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 200,
    });
    return groups.map((g) => ({
      productId: g.productId,
      description: g.description,
      quantity: g._sum.quantity?.toString() ?? '0',
      discount: g._sum.discount?.toString() ?? '0',
      tax: g._sum.taxAmount?.toString() ?? '0',
      total: g._sum.lineTotal?.toString() ?? '0',
    }));
  }

  async inventoryValuation() {
    const tenantId = this.tenant();
    const rows = await this.db.stockLevel.findMany({
      where: { tenantId },
      include: {
        product: { select: { name: true, sku: true, cost: true, price: true, reorderPoint: true } },
        variant: { select: { sku: true, size: true, color: true } },
        warehouse: { select: { name: true } },
      },
    });
    let totalCost = dec(0);
    let totalRetail = dec(0);
    const low = [];
    for (const row of rows) {
      const quantity = Number(row.quantity);
      totalCost = totalCost.plus(dec(row.product.cost).times(quantity));
      totalRetail = totalRetail.plus(dec(row.product.price).times(quantity));
      if (
        row.product.reorderPoint !== null &&
        quantity <= Number(row.product.reorderPoint)
      ) {
        low.push({
          product: row.product.name,
          sku: row.variant?.sku ?? row.product.sku,
          warehouse: row.warehouse.name,
          quantity: row.quantity.toString(),
          reorderPoint: row.product.reorderPoint.toString(),
        });
      }
    }
    return {
      totalCost: roundMoney(totalCost),
      totalRetail: roundMoney(totalRetail),
      margin: totalRetail.isZero()
        ? '0'
        : roundMoney(totalRetail.minus(totalCost).div(totalRetail).times(100)),
      rows: rows.length,
      lowStock: low,
    };
  }

  async salesCsv(from?: string, to?: string): Promise<string> {
    const tenantId = this.tenant();
    const { start, end } = this.range(from, to);
    const sales = await this.db.sale.findMany({
      where: { tenantId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
      include: { customer: { select: { name: true } }, branch: { select: { name: true } } },
    });
    const header = 'numero,fecha,estado,tipo,cliente,sucursal,subtotal,descuento,impuesto,propina,total,pagado,saldo';
    const rows = sales.map((s) =>
      [
        s.number,
        s.createdAt.toISOString(),
        s.status,
        s.type,
        s.customer?.name ?? '',
        s.branch?.name ?? '',
        s.subtotal.toString(),
        s.discount.toString(),
        s.tax.toString(),
        s.tip.toString(),
        s.total.toString(),
        s.paid.toString(),
        s.balance.toString(),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...rows].join('\r\n');
  }
}
