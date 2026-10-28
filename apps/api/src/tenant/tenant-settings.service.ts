import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantRole } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  hashPassword,
  randomPassword,
  validatePassword,
} from '../common/security';
import { StorageService } from '../common/storage.service';
import type { AuthContext } from '../common/guards';
import {
  CreateBranchDto,
  CreateEmployeeDto,
  CreateRegisterDto,
  CreateStoreUserDto,
  CreateWarehouseDto,
  OnboardingDto,
  UpdateStoreSettingsDto,
  UpdateStoreUserDto,
} from './tenant-settings.dto';

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  async store(auth: AuthContext) {
    const store = await this.prisma.store.findUnique({
      where: { id: auth.tenantId! },
      include: { plan: true },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return {
      ...store,
      logoUrl: store.logoKey
        ? this.storage.signedUrl(store.logoKey, store.id, 30)
        : null,
    };
  }

  async updateStore(auth: AuthContext, dto: UpdateStoreSettingsDto, ip?: string) {
    const before = await this.prisma.store.findUnique({ where: { id: auth.tenantId! } });
    if (!before) throw new NotFoundException('Tienda no encontrada.');
    const data: Record<string, unknown> = {};
    for (const key of ['name', 'legalName', 'address', 'city', 'phone'] as const) {
      if (dto[key] !== undefined) data[key] = dto[key] || null;
    }
    if (Object.keys(data).length === 0) return { ok: true };
    const after = await this.prisma.store.update({
      where: { id: auth.tenantId! },
      data: data as never,
    });
    await this.audit.tenant(auth, {
      action: 'STORE_PROFILE_UPDATED',
      entityType: 'Store',
      entityId: before.id,
      before: { name: before.name, address: before.address, city: before.city, phone: before.phone },
      after: data,
      ip,
    });
    return { ok: true, store: after };
  }

  async uploadLogo(
    auth: AuthContext,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunte una imagen.');
    const saved = await this.storage.saveImage({
      tenantId: auth.tenantId!,
      userId: auth.userId,
      originalName: file.originalname,
      buffer: file.buffer,
      visibility: 'PUBLIC_LOGO',
    });
    await this.prisma.store.update({
      where: { id: auth.tenantId! },
      data: { logoKey: saved.id },
    });
    await this.audit.tenant(auth, {
      action: 'STORE_LOGO_UPDATED',
      entityType: 'Store',
      entityId: auth.tenantId,
      after: { fileId: saved.id },
      ip,
    });
    return {
      ok: true,
      logoUrl: this.storage.signedUrl(saved.id, auth.tenantId!, 30),
    };
  }

  async branches() {
    return this.db.branch.findMany({
      where: { tenantId: this.tenantId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { warehouses: true, registers: true } } },
    });
  }

  private get tenantId(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new ForbiddenException('Contexto de tienda requerido.');
    return id;
  }

  async createBranch(auth: AuthContext, dto: CreateBranchDto, ip?: string) {
    const store = await this.prisma.store.findUnique({ where: { id: auth.tenantId! } });
    const limits = (store?.limits ?? {}) as { branches?: number };
    const count = await this.db.branch.count({ where: { tenantId: auth.tenantId! } });
    if (count >= (limits.branches ?? 1)) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_BRANCHES',
        message: `El plan permite ${limits.branches ?? 1} sucursal(es). Habilite multi-sucursal para ampliar.`,
      });
    }
    const branch = await this.db.branch.create({
      data: {
        tenantId: auth.tenantId!,
        name: dto.name,
        code: dto.code.toUpperCase(),
        address: dto.address,
        city: dto.city,
        phone: dto.phone,
      },
    });
    await this.audit.tenant(auth, {
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: branch.id,
      after: dto,
      ip,
    });
    return branch;
  }

  async updateBranch(
    auth: AuthContext,
    id: string,
    dto: Partial<CreateBranchDto> & { active?: boolean },
    ip?: string,
  ) {
    const branch = await this.db.branch.findFirst({
      where: { id, tenantId: auth.tenantId! },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');
    if (dto.active === false) {
      const openCash = await this.db.cashSession.count({
        where: {
          tenantId: auth.tenantId!,
          status: 'OPEN',
          register: { branchId: id },
        },
      });
      if (openCash > 0) {
        throw new ConflictException('Cierre las cajas abiertas antes de desactivar la sucursal.');
      }
    }
    const updated = await this.db.branch.update({ where: { id }, data: dto as never });
    await this.audit.tenant(auth, {
      action: 'BRANCH_UPDATED',
      entityType: 'Branch',
      entityId: id,
      before: branch,
      after: updated,
      ip,
    });
    return updated;
  }

  async warehouses() {
    return this.db.warehouse.findMany({
      where: { tenantId: this.tenantId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createWarehouse(auth: AuthContext, dto: CreateWarehouseDto, ip?: string) {
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId: auth.tenantId! },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    const warehouse = await this.db.warehouse.create({
      data: {
        tenantId: auth.tenantId!,
        branchId: dto.branchId,
        name: dto.name,
        code: dto.code.toUpperCase(),
      },
    });
    await this.audit.tenant(auth, {
      action: 'WAREHOUSE_CREATED',
      entityType: 'Warehouse',
      entityId: warehouse.id,
      after: dto,
      ip,
    });
    return warehouse;
  }

  async registers() {
    return this.db.register.findMany({
      where: { tenantId: this.tenantId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRegister(auth: AuthContext, dto: CreateRegisterDto, ip?: string) {
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, tenantId: auth.tenantId! },
    });
    if (!branch) throw new BadRequestException('Sucursal inválida.');
    const register = await this.db.register.create({
      data: {
        tenantId: auth.tenantId!,
        branchId: dto.branchId,
        name: dto.name,
        code: dto.code.toUpperCase(),
      },
    });
    await this.audit.tenant(auth, {
      action: 'REGISTER_CREATED',
      entityType: 'Register',
      entityId: register.id,
      after: dto,
      ip,
    });
    return register;
  }

  async employees() {
    return this.db.employee.findMany({
      where: { tenantId: this.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createEmployee(auth: AuthContext, dto: CreateEmployeeDto, ip?: string) {
    if (dto.branchId) {
      const branch = await this.db.branch.findFirst({
        where: { id: dto.branchId, tenantId: auth.tenantId! },
      });
      if (!branch) throw new BadRequestException('Sucursal inválida.');
    }
    const employee = await this.db.employee.create({
      data: {
        tenantId: auth.tenantId!,
        branchId: dto.branchId,
        name: dto.name,
        document: dto.document,
        phone: dto.phone,
        role: dto.role,
      },
    });
    await this.db.onboardingTask.updateMany({
      where: { tenantId: auth.tenantId!, key: 'employees' },
      data: { completed: true, completedAt: new Date() },
    });
    await this.audit.tenant(auth, {
      action: 'EMPLOYEE_CREATED',
      entityType: 'Employee',
      entityId: employee.id,
      after: { name: dto.name, role: dto.role },
      ip,
    });
    return employee;
  }

  async users(auth: AuthContext) {
    const memberships = await this.db.membership.findMany({
      where: { tenantId: auth.tenantId! },
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
      orderBy: { createdAt: 'asc' },
    });
    return memberships;
  }

  async createUser(auth: AuthContext, dto: CreateStoreUserDto, ip?: string) {
    if (dto.role === 'OWNER' && auth.role !== 'OWNER') {
      throw new ForbiddenException('Solo el propietario puede designar otro propietario.');
    }
    const check = validatePassword(dto.password, dto.username);
    if (!check.ok) throw new BadRequestException(check.message);
    const store = await this.prisma.store.findUnique({ where: { id: auth.tenantId! } });
    const limits = (store?.limits ?? {}) as { users?: number };
    const count = await this.db.membership.count({
      where: { tenantId: auth.tenantId!, active: true },
    });
    if (count >= (limits.users ?? 3)) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_USERS',
        message: `El plan permite ${limits.users ?? 3} usuarios activos.`,
      });
    }
    const username = dto.username.trim();
    const usernameLower = username.toLowerCase();
    const duplicate = await this.prisma.user.findFirst({
      where: {
        OR: [
          { usernameLower },
          ...(dto.email ? [{ emailLower: dto.email.toLowerCase() }] : []),
        ],
      },
    });
    if (duplicate) throw new ConflictException('Usuario o correo ya registrado.');
    if (dto.branchId) {
      const branch = await this.db.branch.findFirst({
        where: { id: dto.branchId, tenantId: auth.tenantId! },
      });
      if (!branch) throw new BadRequestException('Sucursal inválida.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          usernameLower,
          email: dto.email,
          emailLower: dto.email?.toLowerCase(),
          fullName: dto.fullName,
          passwordHash: await hashPassword(dto.password),
          mustChangePassword: true,
        },
      });
      const membership = await tx.membership.create({
        data: {
          tenantId: auth.tenantId!,
          userId: user.id,
          role: dto.role,
          branchId: dto.branchId,
        },
      });
      return { user, membership };
    });
    await this.audit.tenant(auth, {
      action: 'STORE_USER_CREATED',
      entityType: 'Membership',
      entityId: created.membership.id,
      after: { username, role: dto.role, branchId: dto.branchId },
      ip,
    });
    return { id: created.membership.id, userId: created.user.id, username, role: dto.role };
  }

  async updateUser(
    auth: AuthContext,
    membershipId: string,
    dto: UpdateStoreUserDto,
    ip?: string,
  ) {
    const membership = await this.db.membership.findFirst({
      where: { id: membershipId, tenantId: auth.tenantId! },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('Usuario no encontrado.');
    if (membership.userId === auth.userId && dto.role && dto.role !== membership.role) {
      throw new BadRequestException('No puede cambiar su propio rol.');
    }
    if (
      membership.role === 'OWNER' &&
      ((dto.role && dto.role !== 'OWNER') || dto.active === false)
    ) {
      const owners = await this.db.membership.count({
        where: { tenantId: auth.tenantId!, role: 'OWNER', active: true },
      });
      if (owners <= 1) {
        throw new ForbiddenException('Debe existir al menos un propietario activo.');
      }
    }
    if (dto.role === 'OWNER' && auth.role !== 'OWNER') {
      throw new ForbiddenException('Solo el propietario puede designar otro propietario.');
    }
    const updated = await this.db.membership.update({
      where: { id: membershipId },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.branchId !== undefined
          ? { branchId: dto.branchId || null }
          : {}),
      },
    });
    if (dto.active === false) {
      await this.prisma.session.updateMany({
        where: { userId: membership.userId, tenantId: auth.tenantId!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.tenant(auth, {
      action: 'STORE_USER_UPDATED',
      entityType: 'Membership',
      entityId: membershipId,
      reason: dto.reason,
      before: { role: membership.role, active: membership.active, branchId: membership.branchId },
      after: { role: dto.role, active: dto.active, branchId: dto.branchId },
      ip,
    });
    return updated;
  }

  async resetUserPassword(
    auth: AuthContext,
    membershipId: string,
    reason: string,
    ip?: string,
  ) {
    const membership = await this.db.membership.findFirst({
      where: { id: membershipId, tenantId: auth.tenantId! },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('Usuario no encontrado.');
    if (membership.role === 'OWNER' && auth.role !== 'OWNER') {
      throw new ForbiddenException('Solo el propietario puede restablecer a otro propietario.');
    }
    const temporary = randomPassword(14);
    await this.prisma.user.update({
      where: { id: membership.userId },
      data: {
        passwordHash: await hashPassword(temporary),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.session.updateMany({
      where: { userId: membership.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.tenant(auth, {
      action: 'STORE_USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: membership.userId,
      reason,
      ip,
    });
    return { temporaryPassword: temporary, mustChangePassword: true };
  }

  async onboarding() {
    const [tasks, store] = await Promise.all([
      this.db.onboardingTask.findMany({
        where: { tenantId: this.tenantId },
        orderBy: { key: 'asc' },
      }),
      this.prisma.store.findUnique({ where: { id: this.tenantId } }),
    ]);
    return { tasks, completedAt: store?.onboardingDoneAt, progress: store?.onboardingProgress };
  }

  async setOnboarding(auth: AuthContext, dto: OnboardingDto) {
    const allowed = [
      'branch',
      'warehouse',
      'cash',
      'taxes',
      'products',
      'employees',
      'suppliers',
      'tables',
      'customers',
    ];
    if (!allowed.includes(dto.key)) {
      throw new BadRequestException('Paso de configuración no válido.');
    }
    const task = await this.db.onboardingTask.upsert({
      where: { tenantId_key: { tenantId: auth.tenantId!, key: dto.key } },
      update: {
        completed: dto.completed,
        completedAt: dto.completed ? new Date() : null,
      },
      create: {
        tenantId: auth.tenantId!,
        key: dto.key,
        completed: dto.completed,
        completedAt: dto.completed ? new Date() : null,
      },
    });
    const store = await this.prisma.store.findUnique({ where: { id: auth.tenantId! } });
    const progress = {
      ...((store?.onboardingProgress as Record<string, unknown>) ?? {}),
      ...(dto.progress ?? {}),
      [dto.key]: dto.completed,
    };
    const tasks = await this.db.onboardingTask.findMany({
      where: { tenantId: auth.tenantId! },
    });
    const required = ['branch', 'warehouse', 'cash', 'taxes', 'products', 'employees'];
    const done = tasks.every(
      (t) => t.completed || !required.includes(t.key) || t.key === 'tables',
    );
    await this.prisma.store.update({
      where: { id: auth.tenantId! },
      data: {
        onboardingProgress: progress as never,
        onboardingDoneAt: done ? store?.onboardingDoneAt ?? new Date() : null,
      },
    });
    await this.audit.tenant(auth, {
      action: 'ONBOARDING_UPDATED',
      entityType: 'OnboardingTask',
      entityId: task.id,
      after: { key: dto.key, completed: dto.completed },
    });
    return { task, done, progress };
  }

  async auditLog(auth: AuthContext, page = 1, pageSize = 30) {
    const where = { tenantId: auth.tenantId! };
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }
}
