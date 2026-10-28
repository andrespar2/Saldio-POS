import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec, roundMoney } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthContext } from '../common/guards';
import { CashCloseDto, CashMovementDto, CashOpenDto } from './sales.dto';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new NotFoundException('Contexto de tienda requerido.');
    return id;
  }

  async sessions(query: { registerId?: string; status?: 'OPEN' | 'CLOSED' } = {}, auth?: AuthContext) {
    return this.db.cashSession.findMany({
      where: {
        tenantId: this.tenant(),
        ...(query.registerId ? { registerId: query.registerId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(auth?.branchId ? { register: { branchId: auth.branchId } } : {}),
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: {
        register: { select: { name: true, branch: { select: { name: true } } } },
        _count: { select: { movements: true } },
      },
    });
  }

  async current(registerId?: string, auth?: AuthContext) {
    return this.db.cashSession.findFirst({
      where: {
        tenantId: this.tenant(),
        status: 'OPEN',
        ...(registerId ? { registerId } : {}),
        ...(auth?.branchId ? { register: { branchId: auth.branchId } } : {}),
      },
      include: {
        register: { include: { branch: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
  }

  async session(id: string, auth?: AuthContext) {
    const session = await this.db.cashSession.findFirst({
      where: {
        id,
        tenantId: this.tenant(),
        ...(auth?.branchId ? { register: { branchId: auth.branchId } } : {}),
      },
      include: {
        register: { include: { branch: true } },
        movements: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw new NotFoundException('Caja no encontrada.');
    return session;
  }

  async open(auth: AuthContext, dto: CashOpenDto, ip?: string) {
    const tenantId = this.tenant();
    const register = await this.db.register.findFirst({
      where: { id: dto.registerId, tenantId, active: true },
    });
    if (!register) throw new BadRequestException('Caja inválida.');
    if (auth.branchId && auth.branchId !== register.branchId) {
      throw new ForbiddenException('No puede abrir una caja de otra sucursal.');
    }
    const existing = await this.db.cashSession.findFirst({
      where: { tenantId, registerId: dto.registerId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CASH_ALREADY_OPEN',
        message: 'Esta caja ya tiene una sesión abierta.',
        sessionId: existing.id,
      });
    }
    try {
      const session = await this.db.cashSession.create({
        data: {
          tenantId,
          registerId: dto.registerId,
          openedById: auth.userId,
          openingAmount: dto.openingAmount,
          expectedAmount: dto.openingAmount,
          notes: dto.notes,
        },
      });
      await this.db.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: session.id,
          type: 'OPENING',
          amount: dto.openingAmount,
          referenceType: 'CASH_SESSION',
          referenceId: session.id,
          description: 'Apertura de caja',
          createdById: auth.userId,
        },
      });
      await this.audit.tenant(auth, {
        action: 'CASH_OPENED',
        entityType: 'CashSession',
        entityId: session.id,
        after: { registerId: dto.registerId, openingAmount: dto.openingAmount },
        ip,
      });
      return session;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Esta caja ya tiene una sesión abierta.');
      }
      throw error;
    }
  }

  async close(auth: AuthContext, id: string, dto: CashCloseDto, ip?: string) {
    const tenantId = this.tenant();
    const session = await this.db.cashSession.findFirst({
      where: { id, tenantId },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException('Caja no encontrada.');
    if (session.status === 'CLOSED') throw new ConflictException('La caja ya está cerrada.');
    const expected = session.movements.reduce(
      (sum, movement) => sum.plus(movement.amount),
      dec(0),
    );
    const counted = dec(dto.countedAmount);
    const difference = counted.minus(expected);
    const closed = await this.db.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: auth.userId,
        closedAt: new Date(),
        expectedAmount: roundMoney(expected),
        countedAmount: roundMoney(counted),
        difference: roundMoney(difference),
        notes: dto.notes ?? session.notes,
      },
    });
    await this.audit.tenant(auth, {
      action: 'CASH_CLOSED',
      entityType: 'CashSession',
      entityId: id,
      after: {
        expected: roundMoney(expected),
        counted: roundMoney(counted),
        difference: roundMoney(difference),
      },
      ip,
    });
    return closed;
  }

  async movement(auth: AuthContext, sessionId: string, dto: CashMovementDto, ip?: string) {
    const tenantId = this.tenant();
    const session = await this.db.cashSession.findFirst({
      where: { id: sessionId, tenantId },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException('Caja no encontrada.');
    if (session.status !== 'OPEN') throw new ConflictException('La caja está cerrada.');
    const amount = dec(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('El monto debe ser positivo.');
    const negativeTypes = new Set(['WITHDRAWAL', 'EXPENSE']);
    const signed = negativeTypes.has(dto.type) ? amount.negated() : amount;
    const balance = session.movements.reduce(
      (sum, movement) => sum.plus(movement.amount),
      dec(0),
    );
    if (signed.lt(0) && balance.plus(signed).lt(0)) {
      throw new BadRequestException('El movimiento deja la caja con saldo negativo.');
    }
    const movement = await this.db.cashMovement.create({
      data: {
        tenantId,
        cashSessionId: sessionId,
        type: dto.type as never,
        amount: roundMoney(signed),
        description: dto.description,
        createdById: auth.userId,
      },
    });
    await this.audit.tenant(auth, {
      action: 'CASH_MOVEMENT_CREATED',
      entityType: 'CashMovement',
      entityId: movement.id,
      after: { type: dto.type, amount: roundMoney(signed), description: dto.description },
      ip,
    });
    return movement;
  }
}
