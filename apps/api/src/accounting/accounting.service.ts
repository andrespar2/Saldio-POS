import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { dec, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthContext } from '../common/guards';
import { AccountDto, CreateEntryDto, PeriodDto } from './accounting.dto';

const DEFAULT_ACCOUNTS = [
  { code: '1105', name: 'Caja', type: 'ASSET' },
  { code: '1120', name: 'Bancos', type: 'ASSET' },
  { code: '1305', name: 'Clientes', type: 'ASSET' },
  { code: '1435', name: 'Inventario', type: 'ASSET' },
  { code: '2205', name: 'Proveedores', type: 'LIABILITY' },
  { code: '2408', name: 'IVA por pagar', type: 'LIABILITY' },
  { code: '3105', name: 'Capital', type: 'EQUITY' },
  { code: '4135', name: 'Ventas', type: 'INCOME' },
  { code: '5195', name: 'Gastos operativos', type: 'EXPENSE' },
  { code: '6135', name: 'Costo de ventas', type: 'EXPENSE' },
] as const;

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new Error('Contexto de tienda requerido');
    return id;
  }

  async config() {
    const tenantId = this.tenant();
    return (
      (await this.db.accountingConfig.findUnique({ where: { tenantId } })) ?? {
        tenantId,
        enabled: false,
        accounts: {},
      }
    );
  }

  async setConfig(auth: AuthContext, enabled: boolean) {
    const tenantId = this.tenant();
    const config = await this.db.accountingConfig.upsert({
      where: { tenantId },
      update: { enabled },
      create: { tenantId, enabled },
    });
    if (enabled) await this.ensureDefaults();
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_CONFIG_UPDATED',
      entityType: 'AccountingConfig',
      entityId: config.id,
      after: { enabled },
    });
    return config;
  }

  private async ensureDefaults() {
    const tenantId = this.tenant();
    for (const account of DEFAULT_ACCOUNTS) {
      await this.db.accountingAccount.upsert({
        where: { tenantId_code: { tenantId, code: account.code } },
        update: { name: account.name, type: account.type as never },
        create: {
          tenantId,
          code: account.code,
          name: account.name,
          type: account.type as never,
        },
      });
    }
    const count = await this.db.accountingPeriod.count({ where: { tenantId } });
    if (count === 0) {
      const year = new Date().getFullYear();
      await this.db.accountingPeriod.create({
        data: {
          tenantId,
          name: `Año ${year}`,
          startDate: new Date(Date.UTC(year, 0, 1)),
          endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
        },
      });
    }
  }

  async accounts() {
    await this.ensureDefaults();
    return this.db.accountingAccount.findMany({
      where: { tenantId: this.tenant() },
      orderBy: { code: 'asc' },
    });
  }

  async createAccount(auth: AuthContext, dto: AccountDto) {
    const account = await this.db.accountingAccount.create({
      data: { tenantId: this.tenant(), ...dto },
    });
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_ACCOUNT_CREATED',
      entityType: 'AccountingAccount',
      entityId: account.id,
      after: dto,
    });
    return account;
  }

  async periods() {
    await this.ensureDefaults();
    return this.db.accountingPeriod.findMany({
      where: { tenantId: this.tenant() },
      orderBy: { startDate: 'desc' },
    });
  }

  async createPeriod(auth: AuthContext, dto: PeriodDto) {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('El fin del periodo debe ser posterior al inicio.');
    }
    const period = await this.db.accountingPeriod.create({
      data: {
        tenantId: this.tenant(),
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_PERIOD_CREATED',
      entityType: 'AccountingPeriod',
      entityId: period.id,
      after: dto,
    });
    return period;
  }

  private async openPeriod(date: Date) {
    await this.ensureDefaults();
    const tenantId = this.tenant();
    const period = await this.db.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: 'OPEN',
      },
    });
    if (!period) throw new ConflictException('No hay un periodo contable abierto para la fecha.');
    return period;
  }

  private async nextNumber() {
    const rows = await this.db.$queryRawUnsafe<Array<{ value: number }>>(
      `INSERT INTO "DocumentSequence" ("id", "tenantId", "scope", "value")
       VALUES (gen_random_uuid(), $1, 'JOURNAL', 1)
       ON CONFLICT ("tenantId", "scope")
       DO UPDATE SET "value" = "DocumentSequence"."value" + 1
       RETURNING "value"`,
      this.tenant(),
    );
    return `AS-${String(rows[0]?.value ?? 1).padStart(6, '0')}`;
  }

  async entries(query: { from?: string; to?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.JournalEntryWhereInput = {
      tenantId: this.tenant(),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.journalEntry.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { date: 'desc' },
        include: { lines: { include: { account: true } } },
      }),
      this.db.journalEntry.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async createEntry(auth: AuthContext, dto: CreateEntryDto) {
    const date = new Date(dto.date);
    const period = await this.openPeriod(date);
    let debit = dec(0);
    let credit = dec(0);
    for (const line of dto.lines) {
      if (dec(line.debit).gt(0) && dec(line.credit).gt(0)) {
        throw new BadRequestException('Una línea no puede tener débito y crédito a la vez.');
      }
      const account = await this.db.accountingAccount.findFirst({
        where: { id: line.accountId, tenantId: this.tenant(), active: true },
      });
      if (!account) throw new BadRequestException('Cuenta contable inválida.');
      debit = debit.plus(line.debit);
      credit = credit.plus(line.credit);
    }
    if (!debit.equals(credit) || debit.isZero()) {
      throw new BadRequestException('El asiento debe estar equilibrado y tener valor.');
    }
    const entryRecord = await this.db.journalEntry.create({
      data: {
        tenantId: this.tenant(),
        periodId: period.id,
        number: await this.nextNumber(),
        date,
        description: dto.description,
        sourceType: 'MANUAL',
        createdById: auth.userId,
      },
    });
    await this.db.journalLine.createMany({
      data: dto.lines.map((line) => ({
        tenantId: this.tenant(),
        entryId: entryRecord.id,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      })),
    });
    const entry = await this.db.journalEntry.findFirstOrThrow({
      where: { id: entryRecord.id },
      include: { lines: true },
    });
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_ENTRY_CREATED',
      entityType: 'JournalEntry',
      entityId: entry.id,
      after: { number: entry.number, total: roundMoney(debit) },
    });
    return entry;
  }

  async reverseEntry(auth: AuthContext, id: string, reason: string) {
    const entry = await this.db.journalEntry.findFirst({
      where: { id, tenantId: this.tenant() },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('Asiento no encontrado.');
    if (entry.status === 'REVERSED') throw new ConflictException('El asiento ya fue reversado.');
    const period = await this.openPeriod(new Date());
    const reversalRecord = await this.db.journalEntry.create({
      data: {
        tenantId: this.tenant(),
        periodId: period.id,
        number: await this.nextNumber(),
        date: new Date(),
        description: `Reversión de ${entry.number}: ${reason}`,
        sourceType: 'REVERSAL',
        sourceId: entry.id,
        reversalOfId: entry.id,
        createdById: auth.userId,
      },
    });
    await this.db.journalLine.createMany({
      data: entry.lines.map((line) => ({
        tenantId: this.tenant(),
        entryId: reversalRecord.id,
        accountId: line.accountId,
        debit: line.credit,
        credit: line.debit,
        description: `Reversión ${entry.number}`,
      })),
    });
    const reversal = await this.db.journalEntry.findFirstOrThrow({
      where: { id: reversalRecord.id },
      include: { lines: true },
    });
    await this.db.journalEntry.update({
      where: { id },
      data: { status: 'REVERSED' },
    });
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_ENTRY_REVERSED',
      entityType: 'JournalEntry',
      entityId: id,
      reason,
      after: { reversalId: reversal.id },
    });
    return reversal;
  }

  async closePeriod(auth: AuthContext, id: string) {
    const period = await this.db.accountingPeriod.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!period) throw new NotFoundException('Periodo no encontrado.');
    if (period.status === 'CLOSED') throw new ConflictException('El periodo ya está cerrado.');
    const open = await this.db.journalEntry.count({
      where: { periodId: id, tenantId: this.tenant(), status: 'POSTED' },
    });
    const closed = await this.db.accountingPeriod.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: auth.userId },
    });
    await this.audit.tenant(auth, {
      action: 'ACCOUNTING_PERIOD_CLOSED',
      entityType: 'AccountingPeriod',
      entityId: id,
      after: { entries: open },
    });
    return closed;
  }

  async trialBalance(from?: string, to?: string) {
    const tenantId = this.tenant();
    const accounts = await this.accounts();
    const lines = await this.db.journalLine.findMany({
      where: {
        tenantId,
        entry: {
          status: 'POSTED',
          ...(from || to
            ? {
                date: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
      },
    });
    const map = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const line of lines) {
      const current = map.get(line.accountId) ?? { debit: dec(0), credit: dec(0) };
      current.debit = current.debit.plus(line.debit);
      current.credit = current.credit.plus(line.credit);
      map.set(line.accountId, current);
    }
    let totalDebit = dec(0);
    let totalCredit = dec(0);
    const rows = accounts.map((account) => {
      const values = map.get(account.id) ?? { debit: dec(0), credit: dec(0) };
      totalDebit = totalDebit.plus(values.debit);
      totalCredit = totalCredit.plus(values.credit);
      const balance = account.type === 'ASSET' || account.type === 'EXPENSE'
        ? values.debit.minus(values.credit)
        : values.credit.minus(values.debit);
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: roundMoney(values.debit),
        credit: roundMoney(values.credit),
        balance: roundMoney(balance),
      };
    });
    return {
      rows: rows.filter((r) => Number(r.debit) !== 0 || Number(r.credit) !== 0),
      totalDebit: roundMoney(totalDebit),
      totalCredit: roundMoney(totalCredit),
    };
  }

  async ledger(accountId: string) {
    const account = await this.db.accountingAccount.findFirst({
      where: { id: accountId, tenantId: this.tenant() },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    const lines = await this.db.journalLine.findMany({
      where: { tenantId: this.tenant(), accountId },
      include: { entry: true },
      orderBy: { entry: { date: 'asc' } },
      take: 500,
    });
    return { account, lines };
  }

  /** Contabiliza una venta dentro de la misma transaccion de la venta. */
  async postSale(
    auth: AuthContext,
    sale: {
      id: string;
      number: string;
      createdAt: Date;
      subtotal: Prisma.Decimal;
      discount: Prisma.Decimal;
      tax: Prisma.Decimal;
      balance: Prisma.Decimal;
      lines: Array<{ unitCost: Prisma.Decimal; quantity: Prisma.Decimal }>;
      payments: Array<{ method: string; amount: Prisma.Decimal }>;
    },
  ) {
    const config = await this.db.accountingConfig.findUnique({
      where: { tenantId: this.tenant() },
    });
    if (!config?.enabled) return;
    const period = await this.openPeriod(sale.createdAt);
    const accounts = await this.db.accountingAccount.findMany({
      where: { tenantId: this.tenant() },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const cash = byCode.get('1105');
    const bank = byCode.get('1120');
    const clients = byCode.get('1305');
    const inventory = byCode.get('1435');
    const taxPayable = byCode.get('2408');
    const sales = byCode.get('4135');
    const cogs = byCode.get('6135');
    if (!cash || !bank || !clients || !sales) return;
    const debits = new Map<string, Decimal>();
    const credits = new Map<string, Decimal>();
    const add = (map: Map<string, Decimal>, id: string, value: Decimal) => {
      if (!id || value.isZero()) return;
      map.set(id, (map.get(id) ?? dec(0)).plus(value));
    };
    for (const payment of sale.payments) {
      const account =
        payment.method === 'CASH' ? cash : payment.method === 'CARD' || payment.method === 'TRANSFER' ? bank : cash;
      add(debits, account.id, dec(payment.amount));
    }
    add(debits, clients.id, dec(sale.balance));
    const net = dec(sale.subtotal).minus(sale.discount);
    add(credits, sales.id, net);
    if (taxPayable) add(credits, taxPayable.id, dec(sale.tax));
    const totalDebit = [...debits.values()].reduce((s, v) => s.plus(v), dec(0));
    const totalCredit = [...credits.values()].reduce((s, v) => s.plus(v), dec(0));
    if (!totalDebit.equals(totalCredit)) {
      // Una diferencia de redondeo no debe romper la venta; se registra en la cuenta de ventas.
      const diff = totalDebit.minus(totalCredit);
      if (diff.abs().gt(0.05)) return;
      add(credits, sales.id, diff);
    }
    const cost = sale.lines.reduce(
      (sum, line) => sum.plus(dec(line.unitCost).times(line.quantity)),
      dec(0),
    );
    if (inventory && cogs && cost.gt(0)) {
      add(debits, cogs.id, cost);
      add(credits, inventory.id, cost);
    }
    const entry = await this.db.journalEntry.create({
      data: {
        tenantId: this.tenant(),
        periodId: period.id,
        number: await this.nextNumber(),
        date: sale.createdAt,
        description: `Venta ${sale.number}`,
        sourceType: 'SALE',
        sourceId: sale.id,
        createdById: auth.userId,
      },
    });
    await this.db.journalLine.createMany({
      data: [
        ...[...debits.entries()].map(([accountId, value]) => ({
          tenantId: this.tenant(),
          entryId: entry.id,
          accountId,
          debit: roundMoney(value),
          credit: '0',
        })),
        ...[...credits.entries()].map(([accountId, value]) => ({
          tenantId: this.tenant(),
          entryId: entry.id,
          accountId,
          debit: '0',
          credit: roundMoney(value),
        })),
      ],
    });
    return entry;
  }
}
