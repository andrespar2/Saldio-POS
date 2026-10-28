import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthContext } from '../common/guards';
import type {
  CreateExpenseDto,
  CreateQuoteDto,
  PayReceivableDto,
  QuoteQueryDto,
  ReceivableQueryDto,
} from './sales.dto';
import { SalesService } from './sales.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  async receivables(query: ReceivableQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId: this.tenant(),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total, summary] = await Promise.all([
      this.db.receivable.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          sale: { select: { id: true, number: true, total: true, createdAt: true } },
        },
      }),
      this.db.receivable.count({ where }),
      this.db.receivable.aggregate({
        where: { tenantId: this.tenant(), status: { in: ['OPEN', 'PARTIAL'] } },
        _sum: { balance: true, originalAmount: true, paidAmount: true },
      }),
    ]);
    return {
      items,
      summary: {
        balance: summary._sum.balance?.toString() ?? '0',
        original: summary._sum.originalAmount?.toString() ?? '0',
        paid: summary._sum.paidAmount?.toString() ?? '0',
      },
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  }

  async payReceivable(
    auth: AuthContext,
    id: string,
    dto: PayReceivableDto,
    idempotencyKey?: string,
    ip?: string,
  ) {
    const tenantId = this.tenant();
    const key = idempotencyKey;
    if (key) {
      await this.db.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1), 43)',
        `${tenantId}:${key}`,
      );
      const existing = await this.db.idempotencyRecord.findUnique({
        where: { tenantId_scope_key: { tenantId, scope: 'receivable-payment', key } },
      });
      if (existing?.response) return existing.response;
    }
    const receivable = await this.db.receivable.findFirst({
      where: { id, tenantId },
      include: { sale: true, customer: true },
    });
    if (!receivable) throw new NotFoundException('Cuenta por cobrar no encontrada.');
    if (auth.branchId && receivable.sale.branchId !== auth.branchId) {
      throw new BadRequestException('La cuenta pertenece a otra sucursal.');
    }
    if (receivable.status === 'PAID') throw new ConflictException('La cuenta ya está pagada.');
    const amount = dec(dto.amount);
    if (amount.lte(0) || amount.gt(receivable.balance)) {
      throw new BadRequestException('El abono excede el saldo pendiente.');
    }
    let cashSession = null;
    if (dto.method === 'CASH') {
      cashSession = dto.cashSessionId
        ? await this.db.cashSession.findFirst({
            where: { id: dto.cashSessionId, tenantId, status: 'OPEN' },
          })
        : await this.db.cashSession.findFirst({
            where: {
              tenantId,
              status: 'OPEN',
              ...(receivable.sale.registerId
                ? { registerId: receivable.sale.registerId }
                : {}),
            },
          });
      if (!cashSession) {
        throw new BadRequestException('Abra una caja para recibir el abono en efectivo.');
      }
    }
    const payment = await this.db.receivablePayment.create({
      data: {
        tenantId,
        receivableId: id,
        amount: roundMoney(amount),
        method: dto.method as never,
        reference: dto.reference,
        createdById: auth.userId,
      },
    });
    const newPaid = dec(receivable.paidAmount).plus(amount);
    const newBalance = dec(receivable.balance).minus(amount);
    await this.db.receivable.update({
      where: { id },
      data: {
        paidAmount: roundMoney(newPaid),
        balance: roundMoney(newBalance),
        status: newBalance.isZero() ? 'PAID' : 'PARTIAL',
      },
    });
    await this.db.sale.update({
      where: { id: receivable.saleId },
      data: {
        paid: { increment: amount },
        balance: { decrement: amount },
      },
    });
    if (cashSession) {
      await this.db.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: cashSession.id,
          type: 'SALE',
          amount: roundMoney(amount),
          referenceType: 'RECEIVABLE_PAYMENT',
          referenceId: payment.id,
          description: `Abono cartera ${receivable.customer.name}`,
          createdById: auth.userId,
        },
      });
    }
    const response = {
      ...payment,
      receivableId: id,
      balance: roundMoney(newBalance),
      status: newBalance.isZero() ? 'PAID' : 'PARTIAL',
    };
    if (key) {
      await this.db.idempotencyRecord.create({
        data: {
          tenantId,
          scope: 'receivable-payment',
          key,
          response: JSON.parse(JSON.stringify(response)) as never,
        },
      });
    }
    await this.audit.tenant(auth, {
      action: 'RECEIVABLE_PAYMENT',
      entityType: 'Receivable',
      entityId: id,
      after: { amount: roundMoney(amount), method: dto.method },
      ip,
    });
    return response;
  }

  async createQuote(auth: AuthContext, dto: CreateQuoteDto) {
    const tenantId = this.tenant();
    if (!dto.items.length) throw new BadRequestException('Agregue productos a la cotización.');
    if (dto.customerId) {
      const customer = await this.db.customer.findFirst({
        where: { id: dto.customerId, tenantId },
      });
      if (!customer) throw new BadRequestException('Cliente inválido.');
    }
    const lines: Array<{
      productId: string;
      description: string;
      quantity: string;
      unitPrice: string;
      discount: string;
      taxRate: string;
      total: string;
    }> = [];
    let subtotal = dec(0);
    let tax = dec(0);
    let total = dec(0);
    for (const item of dto.items) {
      const product = await this.db.product.findFirst({
        where: { id: item.productId, tenantId, active: true },
        include: { tax: true },
      });
      if (!product) throw new BadRequestException('Producto inválido.');
      const { computeLine } = await import('@saldio/shared');
      const computed = computeLine({
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? product.price.toString(),
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        taxRate: product.tax?.rate.toString() ?? '0',
      });
      subtotal = subtotal.plus(computed.gross);
      tax = tax.plus(computed.tax);
      total = total.plus(computed.total);
      lines.push({
        productId: product.id,
        description: product.name,
        quantity: computed.quantity,
        unitPrice: computed.unitPrice,
        discount: computed.discount,
        taxRate: product.tax?.rate.toString() ?? '0',
        total: computed.total,
      });
    }
    const seq = await this.db.documentSequence.upsert({
      where: { tenantId_scope: { tenantId, scope: 'QUOTE' } },
      update: { value: { increment: 1 } },
      create: { tenantId, scope: 'QUOTE', value: 1 },
    });
    const quoteRecord = await this.db.quote.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        number: `COT-${String(seq.value).padStart(6, '0')}`,
        status: 'DRAFT',
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        subtotal: roundMoney(subtotal),
        tax: roundMoney(tax),
        total: roundMoney(total),
        notes: dto.notes,
        createdById: auth.userId,
      },
    });
    await this.db.quoteLine.createMany({
      data: lines.map((line) => ({
        tenantId,
        quoteId: quoteRecord.id,
        ...line,
      })),
    });
    const quote = await this.db.quote.findFirstOrThrow({
      where: { id: quoteRecord.id },
      include: { lines: true },
    });
    await this.audit.tenant(auth, {
      action: 'QUOTE_CREATED',
      entityType: 'Quote',
      entityId: quote.id,
      after: { number: quote.number, total: quote.total.toString() },
    });
    return quote;
  }

  async quotes(query: QuoteQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId: this.tenant(),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.quote.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
      this.db.quote.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async quote(id: string) {
    const quote = await this.db.quote.findFirst({
      where: { id, tenantId: this.tenant() },
      include: { lines: true, customer: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada.');
    return quote;
  }

  async convertQuote(auth: AuthContext, id: string, ip?: string) {
    const quote = await this.quote(id);
    if (quote.status === 'CONVERTED') {
      throw new ConflictException('La cotización ya fue convertida.');
    }
    if (!quote.customerId) {
      throw new BadRequestException('Asigne un cliente antes de convertir la cotización.');
    }
    const sales = await this.sales.create(
      auth,
      {
        branchId: (await this.db.branch.findFirst({ where: { tenantId: this.tenant() } }))!.id,
        customerId: quote.customerId,
        type: 'CREDIT',
        saleType: 'QUOTE',
        items: quote.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          discountAmount: line.discount.toString(),
        })),
        payments: [],
        notes: `Cotización ${quote.number}`,
      },
      { allowPriceOverride: true, internalSaleType: 'QUOTE' },
    );
    await this.db.quote.update({
      where: { id },
      data: { status: 'CONVERTED', saleId: sales.id },
    });
    await this.audit.tenant(auth, {
      action: 'QUOTE_CONVERTED',
      entityType: 'Quote',
      entityId: id,
      after: { saleId: sales.id },
      ip,
    });
    return sales;
  }

  async createExpense(auth: AuthContext, dto: CreateExpenseDto, ip?: string) {
    const tenantId = this.tenant();
    if (auth.branchId && auth.branchId !== dto.branchId) {
      throw new BadRequestException('El gasto pertenece a otra sucursal.');
    }
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    let cashSession = null;
    if (dto.paymentMethod === 'CASH' || dto.cashSessionId) {
      cashSession = dto.cashSessionId
        ? await this.db.cashSession.findFirst({
            where: { id: dto.cashSessionId, tenantId, status: 'OPEN' },
          })
        : await this.db.cashSession.findFirst({
            where: {
              tenantId,
              status: 'OPEN',
              register: { branchId: dto.branchId },
            },
          });
      if (!cashSession) throw new BadRequestException('Abra una caja para el gasto en efectivo.');
    }
    const expense = await this.db.expense.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        cashSessionId: cashSession?.id,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        paymentMethod: (dto.paymentMethod ?? 'CASH') as never,
        createdById: auth.userId,
      },
    });
    if (cashSession) {
      await this.db.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: cashSession.id,
          type: 'EXPENSE',
          amount: roundMoney(dec(dto.amount).negated()),
          referenceType: 'EXPENSE',
          referenceId: expense.id,
          description: dto.description,
          createdById: auth.userId,
        },
      });
    }
    await this.audit.tenant(auth, {
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      after: { category: dto.category, amount: dto.amount },
      ip,
    });
    return expense;
  }

  async expenses(query: { from?: string; to?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ExpenseWhereInput = {
      tenantId: this.tenant(),
      ...(query.from || query.to
        ? {
            expenseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.db.expense.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { expenseDate: 'desc' },
        include: { branch: { select: { name: true } } },
      }),
      this.db.expense.count({ where }),
      this.db.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      items,
      total: sum._sum.amount?.toString() ?? '0',
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  }
}
