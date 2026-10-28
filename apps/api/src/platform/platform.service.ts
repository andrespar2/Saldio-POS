import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { BusinessType, ModuleCode, PlatformRole } from '@saldio/shared';
import {
  MODULES,
  PLATFORM_ROLE_PERMISSIONS,
  isBusinessType,
} from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { StoreProvisioningService } from '../stores/provisioning.service';
import { AuthService } from '../auth/auth.service';
import { validatePassword, hashPassword } from '../common/security';
import { StorageService } from '../common/storage.service';
import { JobsService } from '../common/jobs.service';
import { SettingsService } from '../common/settings.service';
import type { AuthContext } from '../common/guards';
import type { Env } from '../config/env';
import {
  ChangePlanDto,
  ChangeStoreStatusDto,
  CreatePlatformAdminDto,
  PlanDto,
  PlatformSettingsDto,
  StoreQueryDto,
  SupportSessionDto,
  UpdatePlatformAdminDto,
  UpdatePlanDto,
  UpdateStoreDto,
} from './platform.dto';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provisioning: StoreProvisioningService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async dashboard() {
    const [groups, recent, jobs, emailPending] = await Promise.all([
      this.prisma.store.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.store.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          ownerName: true,
          status: true,
          businessType: true,
          createdAt: true,
          plan: { select: { name: true } },
        },
      }),
      this.jobs.stats(),
      this.prisma.emailOutbox.count({ where: { status: 'PENDING' } }),
    ]);
    const counts = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0, DISABLED: 0 };
    for (const group of groups) counts[group.status] = group._count._all;
    const active = await this.prisma.store.findMany({
      where: { status: 'ACTIVE' },
      select: { plan: { select: { price: true, name: true } } },
    });
    const mrr = active.reduce(
      (sum, s) => sum + Number(s.plan?.price ?? 0),
      0,
    );
    return {
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      mrr: mrr.toFixed(2),
      recentStores: recent,
      jobs,
      emailPending,
      autoApproveStores: await this.autoApprove(),
    };
  }

  async autoApprove(): Promise<boolean> {
    const setting = await this.settings.get<boolean | null>(
      'stores.autoApprove',
      null,
    );
    return setting ?? this.config.get('AUTO_APPROVE_STORES', { infer: true });
  }

  async listStores(query: StoreQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { legalName: { contains: search, mode: 'insensitive' as const } },
              { taxId: { contains: search, mode: 'insensitive' as const } },
              { ownerName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          legalName: true,
          taxId: true,
          ownerName: true,
          email: true,
          phone: true,
          city: true,
          status: true,
          businessType: true,
          createdAt: true,
          suspensionEndsAt: true,
          plan: { select: { id: true, code: true, name: true } },
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.store.count({ where }),
    ]);
    return {
      items,
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  }

  async storeDetail(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: {
        plan: true,
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                phone: true,
                status: true,
                mustChangePassword: true,
                lastLoginAt: true,
              },
            },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const tenant = await this.prisma.withTenant({ tenantId: id }, async () => {
      const db = this.prisma.db;
      const [products, salesCount, salesAgg, openCash, openOrders, lastSales] =
        await Promise.all([
          db.product.count({ where: { tenantId: id } }),
          db.sale.count({ where: { tenantId: id } }),
          db.sale.aggregate({
            where: { tenantId: id, status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED'] } },
            _sum: { total: true },
          }),
          db.cashSession.count({ where: { tenantId: id, status: 'OPEN' } }),
          db.restaurantOrder.count({ where: { tenantId: id, status: { notIn: ['PAID', 'CANCELLED'] } } }),
          db.sale.findMany({
            where: { tenantId: id },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, number: true, total: true, status: true, createdAt: true },
          }),
        ]);
      return {
        products,
        salesCount,
        salesTotal: salesAgg._sum.total?.toString() ?? '0',
        openCash,
        openOrders,
        lastSales,
      };
    });
    const [history, supportSessions, audit, subscription] = await Promise.all([
      this.prisma.withPlatform(() =>
        this.prisma.db.storeStatusHistory.findMany({
          where: { tenantId: id },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      ),
      this.prisma.supportSession.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.adminAudit.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          actor: { select: { username: true, fullName: true } },
        },
      }),
      this.prisma.subscription.findUnique({ where: { tenantId: id } }),
    ]);
    return {
      store: {
        ...store,
        logoUrl: store.logoKey
          ? this.storage.signedUrl(store.logoKey, store.id, 30)
          : null,
      },
      tenant,
      subscription,
      statusHistory: history,
      supportSessions,
      audit,
    };
  }

  async updateStore(
    auth: AuthContext,
    id: string,
    dto: UpdateStoreDto,
    ip?: string,
  ) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const data: Record<string, unknown> = {};
    const fields = [
      'name',
      'legalName',
      'taxType',
      'taxId',
      'ownerName',
      'email',
      'phone',
      'address',
      'city',
    ] as const;
    for (const field of fields) {
      if (dto[field] !== undefined) data[field] = dto[field] || null;
    }
    if (dto.email !== undefined) {
      data.email = dto.email;
      data.emailLower = dto.email.toLowerCase();
    }
    if (dto.businessType && dto.businessType !== store.businessType) {
      if (!isBusinessType(dto.businessType)) {
        throw new BadRequestException('Tipo de negocio no soportado.');
      }
      const target = dto.businessType as BusinessType;
      const blockers = await this.prisma.withTenant({ tenantId: id }, async () => {
        const db = this.prisma.db;
        const [openOrders, variants, recipes] = await Promise.all([
          db.restaurantOrder.count({
            where: {
              tenantId: id,
              status: { notIn: ['PAID', 'CANCELLED'] },
            },
          }),
          db.productVariant.count({ where: { tenantId: id } }),
          db.recipeIngredient.count({ where: { tenantId: id } }),
        ]);
        return { openOrders, variants, recipes };
      });
      if (blockers.openOrders > 0) {
        throw new ConflictException({
          code: 'SECTOR_CHANGE_BLOCKED_OPEN_ORDERS',
          message:
            'Cierre o anule los pedidos abiertos antes de cambiar el tipo de negocio.',
          blockers,
        });
      }
      const requiresConfirmation =
        (blockers.variants > 0 && target !== 'CLOTHING') ||
        (blockers.recipes > 0 && target !== 'RESTAURANT');
      if (requiresConfirmation && !dto.confirmIncompatible) {
        throw new ConflictException({
          code: 'SECTOR_CHANGE_REQUIRES_CONFIRMATION',
          message:
            'El cambio de sector ocultará funciones con datos existentes. Confirme para continuar; no se eliminarán datos.',
          blockers,
        });
      }
      data.businessType = target;
    }
    if (Object.keys(data).length === 0) return { ok: true };
    try {
      const updated = await this.prisma.store.update({
        where: { id },
        data: data as never,
      });
      await this.audit.platform(auth.userId, {
        action: 'STORE_UPDATED',
        entityType: 'Store',
        entityId: id,
        tenantId: id,
        reason: dto.reason ?? 'Corrección administrativa',
        before: this.pick(store as unknown as Record<string, unknown>, Object.keys(data)),
        after: this.pick(updated as unknown as Record<string, unknown>, Object.keys(data)),
        ip,
      });
      return { ok: true, store: updated };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'Ya existe una tienda con ese correo o identificación tributaria.',
        );
      }
      throw error;
    }
  }

  private pick(source: Record<string, unknown>, keys: string[]) {
    return Object.fromEntries(keys.map((key) => [key, source[key]]));
  }

  async approveStore(auth: AuthContext, id: string, ip?: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    if (store.status === 'ACTIVE') return { ok: true, status: 'ACTIVE' };
    await this.prisma.withPlatform(async () => {
      await this.prisma.db.store.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          approvedAt: new Date(),
          suspendedAt: null,
          suspensionEndsAt: null,
          suspensionReason: null,
          disabledAt: null,
          disabledReason: null,
        },
      });
      await this.prisma.db.storeStatusHistory.create({
        data: {
          tenantId: id,
          from: store.status,
          to: 'ACTIVE',
          reason: 'Aprobación administrativa',
          actorId: auth.userId,
        },
      });
      await this.provisioning.ensureDefaults(
        id,
        store.businessType as BusinessType,
        (store.contractedModules ?? []) as ModuleCode[],
      );
    });
    await this.audit.platform(auth.userId, {
      action: 'STORE_APPROVED',
      entityType: 'Store',
      entityId: id,
      tenantId: id,
      before: { status: store.status },
      after: { status: 'ACTIVE' },
      reason: 'Aprobación de tienda',
      ip,
    });
    return { ok: true, status: 'ACTIVE' };
  }

  async changeStatus(
    auth: AuthContext,
    id: string,
    dto: ChangeStoreStatusDto,
    ip?: string,
  ) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    if (store.status === dto.status) {
      return { ok: true, status: store.status };
    }
    if (dto.status === 'SUSPENDED') {
      if (dto.endsAt && new Date(dto.endsAt) <= new Date()) {
        throw new BadRequestException(
          'La fecha de finalización debe ser futura o dejarse vacía.',
        );
      }
    }
    const now = new Date();
    const data =
      dto.status === 'ACTIVE'
        ? {
            status: 'ACTIVE' as const,
            suspendedAt: null,
            suspensionEndsAt: null,
            suspensionReason: null,
            disabledAt: null,
            disabledReason: null,
            approvedAt: store.approvedAt ?? now,
          }
        : dto.status === 'SUSPENDED'
          ? {
              status: 'SUSPENDED' as const,
              suspendedAt: now,
              suspensionEndsAt: dto.endsAt ? new Date(dto.endsAt) : null,
              suspensionReason: dto.reason,
            }
          : {
              status: 'DISABLED' as const,
              disabledAt: now,
              disabledReason: dto.reason,
              suspensionEndsAt: null,
            };
    await this.prisma.withPlatform(async () => {
      await this.prisma.db.store.update({ where: { id }, data });
      await this.prisma.db.storeStatusHistory.create({
        data: {
          tenantId: id,
          from: store.status,
          to: dto.status,
          reason: dto.reason,
          actorId: auth.userId,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      });
    });
    if (dto.status !== 'ACTIVE') {
      await this.prisma.session.updateMany({
        where: { tenantId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await this.audit.platform(auth.userId, {
      action:
        dto.status === 'SUSPENDED'
          ? 'STORE_SUSPENDED'
          : dto.status === 'DISABLED'
            ? 'STORE_DISABLED'
            : 'STORE_REACTIVATED',
      entityType: 'Store',
      entityId: id,
      tenantId: id,
      reason: dto.reason,
      before: {
        status: store.status,
        suspensionEndsAt: store.suspensionEndsAt,
      },
      after: { status: dto.status, endsAt: dto.endsAt ?? null },
      ip,
    });
    return { ok: true, status: dto.status };
  }

  async changePlan(auth: AuthContext, id: string, dto: ChangePlanDto, ip?: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || plan.status !== 'ACTIVE') {
      throw new BadRequestException('Plan no disponible.');
    }
    const enabled = (dto.enabledModules ?? []).filter((m) =>
      (MODULES as readonly string[]).includes(m),
    );
    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        planId: plan.id,
        contractedModules: plan.modules,
        enabledModules: enabled,
        limits: (dto.limits ?? (plan.limits as Record<string, number>)) as never,
      },
    });
    await this.audit.platform(auth.userId, {
      action: 'STORE_PLAN_CHANGED',
      entityType: 'Store',
      entityId: id,
      tenantId: id,
      reason: dto.reason ?? 'Cambio de plan',
      before: { planId: store.planId, enabledModules: store.enabledModules },
      after: { planId: plan.id, enabledModules: enabled },
      ip,
    });
    return { ok: true, store: updated };
  }

  async listAdmins() {
    const admins = await this.prisma.user.findMany({
      where: { isPlatformAdmin: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        platformRole: true,
        platformPermissions: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return admins;
  }

  private async assertNotLastSuperAdmin(targetId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target?.isPlatformAdmin) return;
    if (target.platformRole !== 'SUPER_ADMIN') return;
    const supers = await this.prisma.user.count({
      where: {
        isPlatformAdmin: true,
        status: 'ACTIVE',
        platformRole: 'SUPER_ADMIN',
      },
    });
    if (supers <= 1) {
      throw new ForbiddenException({
        code: 'LAST_PLATFORM_ADMIN',
        message:
          'No se puede deshabilitar o degradar al último administrador con capacidad de gestionar la plataforma.',
      });
    }
  }

  async createAdmin(auth: AuthContext, dto: CreatePlatformAdminDto, ip?: string) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    const check = validatePassword(dto.password, username);
    if (!check.ok) throw new BadRequestException(check.message);
    const duplicate = await this.prisma.user.findFirst({
      where: {
        OR: [{ usernameLower: username.toLowerCase() }, { emailLower: email }],
      },
    });
    if (duplicate) throw new ConflictException('Usuario o correo ya registrado.');
    const permissions =
      dto.permissions?.filter((p) => p.startsWith('platform.')) ??
      PLATFORM_ROLE_PERMISSIONS[dto.role as PlatformRole];
    const user = await this.prisma.user.create({
      data: {
        username,
        usernameLower: username.toLowerCase(),
        email,
        emailLower: email,
        fullName: dto.fullName.trim(),
        passwordHash: await hashPassword(dto.password),
        isPlatformAdmin: true,
        platformRole: dto.role,
        platformPermissions: permissions,
        mustChangePassword: true,
      },
      select: { id: true, username: true, fullName: true, platformRole: true },
    });
    await this.audit.platform(auth.userId, {
      action: 'PLATFORM_ADMIN_CREATED',
      entityType: 'User',
      entityId: user.id,
      after: { username, role: dto.role, permissions },
      ip,
    });
    return { ok: true, admin: user };
  }

  async updateAdmin(
    auth: AuthContext,
    id: string,
    dto: UpdatePlatformAdminDto,
    ip?: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target?.isPlatformAdmin) throw new NotFoundException('Administrador no encontrado.');
    if (dto.status === 'DISABLED' || (dto.role && dto.role !== 'SUPER_ADMIN')) {
      await this.assertNotLastSuperAdmin(id);
    }
    const permissions =
      dto.permissions ??
      (dto.role ? PLATFORM_ROLE_PERMISSIONS[dto.role as PlatformRole] : undefined);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.role ? { platformRole: dto.role } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(permissions ? { platformPermissions: permissions } : {}),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        platformRole: true,
        platformPermissions: true,
        status: true,
      },
    });
    if (dto.status === 'DISABLED') {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.platform(auth.userId, {
      action: 'PLATFORM_ADMIN_UPDATED',
      entityType: 'User',
      entityId: id,
      reason: dto.reason,
      before: {
        fullName: target.fullName,
        role: target.platformRole,
        status: target.status,
      },
      after: { role: dto.role, status: dto.status, fullName: dto.fullName },
      ip,
    });
    return { ok: true, admin: updated };
  }

  async resetUserPassword(
    auth: AuthContext,
    userId: string,
    reason: string,
    ip?: string,
  ) {
    return this.auth.adminResetPassword(auth.userId, userId, reason, ip);
  }

  async createSupportSession(
    auth: AuthContext,
    tenantId: string,
    dto: SupportSessionDto,
    ip?: string,
  ) {
    const store = await this.prisma.store.findUnique({ where: { id: tenantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const minutes =
      dto.minutes ??
      this.config.get('SUPPORT_SESSION_MINUTES', { infer: true }) ??
      30;
    const session = await this.prisma.supportSession.create({
      data: {
        adminUserId: auth.userId,
        tenantId,
        reason: dto.reason,
        readOnly: true,
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });
    const tokens = await this.auth.issueSupportToken(
      auth.userId,
      tenantId,
      session.id,
      minutes,
    );
    await this.audit.platform(auth.userId, {
      action: 'SUPPORT_SESSION_STARTED',
      entityType: 'SupportSession',
      entityId: session.id,
      tenantId,
      reason: dto.reason,
      after: { expiresAt: session.expiresAt, readOnly: true },
      ip,
    });
    return { session, tokens };
  }

  async revokeSupportSession(auth: AuthContext, id: string) {
    const session = await this.prisma.supportSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sesión de soporte no encontrada.');
    await this.prisma.supportSession.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.prisma.session.updateMany({
      where: { supportSessionId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.platform(auth.userId, {
      action: 'SUPPORT_SESSION_REVOKED',
      entityType: 'SupportSession',
      entityId: id,
      tenantId: session.tenantId,
      reason: 'Revocación manual',
    });
    return { ok: true };
  }

  async listPlans() {
    const [plans, addons] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: { price: 'asc' } }),
      this.prisma.addon.findMany({ orderBy: { price: 'asc' } }),
    ]);
    return { plans, addons };
  }

  async createPlan(auth: AuthContext, dto: PlanDto, ip?: string) {
    const modules = dto.modules.filter((m) =>
      (MODULES as readonly string[]).includes(m),
    );
    if (!modules.length) throw new BadRequestException('Seleccione módulos válidos.');
    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        price: dto.price,
        modules,
        limits: dto.limits as never,
        status: dto.status ?? 'ACTIVE',
      },
    });
    await this.audit.platform(auth.userId, {
      action: 'PLATFORM_PLAN_CREATED',
      entityType: 'Plan',
      entityId: plan.id,
      after: { code: plan.code, modules, price: dto.price },
      ip,
    });
    return plan;
  }

  async updatePlan(auth: AuthContext, id: string, dto: UpdatePlanDto, ip?: string) {
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Plan no encontrado.');
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price ? { price: dto.price } : {}),
        ...(dto.modules
          ? {
              modules: dto.modules.filter((m) =>
                (MODULES as readonly string[]).includes(m),
              ),
            }
          : {}),
        ...(dto.limits ? { limits: dto.limits as never } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        version: before.version + 1,
      },
    });
    await this.audit.platform(auth.userId, {
      action: 'PLATFORM_PLAN_UPDATED',
      entityType: 'Plan',
      entityId: id,
      before: { modules: before.modules, price: before.price, status: before.status },
      after: { modules: plan.modules, price: plan.price, status: plan.status },
      ip,
    });
    return plan;
  }

  async getSettings() {
    return {
      autoApproveStores: await this.autoApprove(),
      supportEmail: await this.settings.get('support.email', 'soporte@saldio.app'),
      publicNotice: await this.settings.get('platform.notice', ''),
    };
  }

  async updateSettings(auth: AuthContext, dto: PlatformSettingsDto, ip?: string) {
    if (dto.autoApproveStores !== undefined) {
      await this.settings.set('stores.autoApprove', dto.autoApproveStores);
    }
    if (dto.supportEmail) await this.settings.set('support.email', dto.supportEmail);
    if (dto.publicNotice !== undefined) {
      await this.settings.set('platform.notice', dto.publicNotice);
    }
    await this.audit.platform(auth.userId, {
      action: 'PLATFORM_SETTINGS_UPDATED',
      entityType: 'SystemSetting',
      after: { ...dto },
      ip,
    });
    return this.getSettings();
  }

  async auditLog(query: { tenantId?: string; action?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminAudit.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { username: true, fullName: true } } },
      }),
      this.prisma.adminAudit.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async operations() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    const [jobsStats, failedJobs, integrationLogs, pendingEmails, activeSessions] =
      await Promise.all([
        this.jobs.stats(),
        this.prisma.job.findMany({
          where: { status: 'FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        this.prisma.integrationLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.emailOutbox.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
        this.prisma.session.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
        }),
      ]);
    return {
      service: {
        status: 'ok',
        version: '0.1.0-beta.1',
        databaseLatencyMs: latency,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      jobs: jobsStats,
      failedJobs,
      integrationLogs,
      pendingEmails,
      activeSessions,
      integrations: {
        payments: {
          provider: this.config.get('PAYMENTS_PROVIDER', { infer: true }),
          mode: this.config.get('PAYMENTS_MODE', { infer: true }),
          configured: Boolean(
            this.config.get('PAYMENTS_WEBHOOK_SECRET', { infer: true }),
          ),
        },
        fiscal: {
          provider: this.config.get('FISCAL_PROVIDER', { infer: true }),
          mode: this.config.get('FISCAL_MODE', { infer: true }),
          configured: this.config.get('FISCAL_PROVIDER', { infer: true }) !== 'disabled',
        },
      },
    };
  }

  async retryJob(id: string) {
    await this.jobs.retry(id);
    return { ok: true };
  }

  @Interval(60_000)
  async expireSuspensions(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.store.findMany({
      where: {
        status: 'SUSPENDED',
        suspensionEndsAt: { not: null, lte: now },
      },
      select: { id: true, name: true, suspensionEndsAt: true },
    });
    for (const store of expired) {
      try {
        const changed = await this.prisma.withPlatform(async () => {
          const result = await this.prisma.db.store.updateMany({
            where: {
              id: store.id,
              status: 'SUSPENDED',
              suspensionEndsAt: { lte: now },
            },
            data: {
              status: 'ACTIVE',
              suspendedAt: null,
              suspensionEndsAt: null,
              suspensionReason: null,
            },
          });
          if (result.count === 0) return false;
          await this.prisma.db.storeStatusHistory.create({
            data: {
              tenantId: store.id,
              from: 'SUSPENDED',
              to: 'ACTIVE',
              reason: 'Vencimiento automático de suspensión temporal',
            },
          });
          return true;
        });
        if (changed) {
          await this.audit.platform(null, {
            action: 'STORE_SUSPENSION_EXPIRED',
            entityType: 'Store',
            entityId: store.id,
            tenantId: store.id,
            reason: 'Vencimiento programado',
            after: { status: 'ACTIVE' },
          });
          this.logger.log(`Suspensión vencida reactivada: ${store.id}`);
        }
      } catch (error) {
        this.logger.error(`No se pudo reactivar ${store.id}: ${String(error)}`);
      }
    }
  }
}
