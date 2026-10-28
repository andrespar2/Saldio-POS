import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import {
  PLATFORM_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  type TenantRole,
} from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  hashPassword,
  hashToken,
  randomPassword,
  randomToken,
  validatePassword,
  verifyPassword,
} from '../common/security';
import { MailService } from '../common/mail.service';
import type { Env } from '../config/env';
import type { AuthContext } from '../common/guards';

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: Record<string, unknown>;
  store?: Record<string, unknown> | null;
  memberships: Array<Record<string, unknown>>;
  platform: boolean;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(randomToken(24));
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  private userView(user: User) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
      platformRole: user.platformRole,
      platformPermissions: user.platformPermissions,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  private async membershipViews(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, active: true },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            status: true,
            businessType: true,
            plan: { select: { code: true, name: true, modules: true } },
            enabledModules: true,
          },
        },
      },
    });
    return memberships.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      role: m.role,
      branchId: m.branchId,
      store: m.store
        ? {
            id: m.store.id,
            name: m.store.name,
            status: m.store.status,
            businessType: m.store.businessType,
            plan: m.store.plan,
            enabledModules: m.store.enabledModules,
          }
        : null,
    }));
  }

  private async issueTokens(
    user: User,
    membership?: {
      id: string;
      tenantId: string;
      role: TenantRole;
      branchId: string | null;
    } | null,
    support?: { supportSessionId?: string; readOnly?: boolean },
  ): Promise<SessionResult> {
    const refreshToken = randomToken(48);
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tenantId: membership?.tenantId,
        membershipId: membership?.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
        supportSessionId: support?.supportSessionId,
        userAgent: undefined,
      },
    });
    const payload = {
      sub: user.id,
      sid: session.id,
      tenantId: membership?.tenantId,
      membershipId: membership?.id,
      role: membership?.role,
      platformRole: user.platformRole ?? undefined,
      supportSessionId: support?.supportSessionId,
      readOnly: support?.readOnly,
      scope: 'access' as const,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const memberships = await this.membershipViews(user.id);
    const store = membership
      ? memberships.find((m) => m.tenantId === membership.tenantId)?.store ?? null
      : null;
    return {
      accessToken,
      refreshToken,
      accessExpiresIn: 900,
      user: this.userView(user),
      store,
      memberships,
      platform: Boolean(user.platformRole),
    };
  }

  async login(params: {
    username: string;
    password: string;
    tenantId?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const identifier = this.normalize(params.username);
    if (!identifier || !params.password) {
      throw new BadRequestException('Ingrese usuario y contraseña.');
    }
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ usernameLower: identifier }, { emailLower: identifier }] },
    });
    const passwordOk = await verifyPassword(
      params.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !passwordOk) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            lockedUntil:
              attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : user.lockedUntil,
          },
        });
      }
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('La cuenta está deshabilitada.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'La cuenta está bloqueada temporalmente por intentos fallidos.',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, active: true },
      include: { store: true },
    });

    if (params.tenantId) {
      const chosen = memberships.find((m) => m.tenantId === params.tenantId);
      if (!chosen) throw new ForbiddenException('No pertenece a esa tienda.');
      return this.issueTokens(user, chosen, undefined);
    }

    if (user.platformRole) {
      // Un administrador de plataforma entra al panel administrativo.
      return this.issueTokens(user, null, undefined);
    }
    if (memberships.length === 0) {
      throw new ForbiddenException(
        'La cuenta no tiene una tienda activa. Contacte a soporte@saldio.app.',
      );
    }
    if (memberships.length === 1) {
      return this.issueTokens(user, memberships[0]!);
    }
    const selectionToken = await this.jwt.signAsync(
      { sub: user.id, scope: 'select' },
      { expiresIn: '10m' },
    );
    return {
      requiresStoreSelection: true,
      selectionToken,
      user: this.userView(user),
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        storeName: m.store.name,
        status: m.store.status,
        role: m.role,
      })),
    };
  }

  /**
   * Token de soporte de solo lectura, temporal y auditado.
   * No se emite para un administrador que no tenga el permiso de soporte.
   */
  async issueSupportToken(
    adminUserId: string,
    tenantId: string,
    supportSessionId: string,
    minutes: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: adminUserId } });
    if (!user || user.status !== 'ACTIVE' || !user.platformRole) {
      throw new ForbiddenException('Administrador no disponible.');
    }
    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tenantId,
        supportSessionId,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: session.id,
        tenantId,
        role: 'OWNER',
        platformRole: user.platformRole,
        supportSessionId,
        readOnly: true,
        scope: 'access',
      },
      { expiresIn: `${minutes}m` },
    );
    const memberships = await this.membershipViews(user.id);
    const store = await this.prisma.store.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, status: true, businessType: true },
    });
    return {
      accessToken,
      refreshToken,
      accessExpiresIn: minutes * 60,
      user: this.userView(user),
      store,
      memberships,
      platform: true,
      support: {
        sessionId: supportSessionId,
        readOnly: true,
        expiresAt,
      },
    };
  }

  async selectTenant(selectionToken: string, tenantId: string) {    let payload: { sub: string; scope: string };
    try {
      payload = await this.jwt.verifyAsync(selectionToken);
    } catch {
      throw new UnauthorizedException('La selección de tienda expiró.');
    }
    if (payload.scope !== 'select') {
      throw new UnauthorizedException('Token de selección inválido.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Cuenta no disponible.');
    }
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, tenantId, active: true },
    });
    if (!membership) throw new ForbiddenException('No pertenece a esa tienda.');
    return this.issueTokens(user, membership);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Sesión no válida.');
    const hash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Sesión no válida.');
    if (session.revokedAt) {
      // Posible reutilización de un refresh token rotado: revocar todo.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Reutilización de refresh token detectada para ${session.userId}`);
      throw new UnauthorizedException('La sesión fue revocada por seguridad.');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('La sesión expiró.');
    }
    const user = session.user;
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Cuenta deshabilitada.');
    if (session.supportSessionId) {
      const support = await this.prisma.supportSession.findUnique({
        where: { id: session.supportSessionId },
      });
      if (!support || support.status !== 'ACTIVE' || support.expiresAt < new Date()) {
        throw new UnauthorizedException('La sesión de soporte expiró.');
      }
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return this.issueSupportToken(
        user.id,
        support.tenantId,
        support.id,
        Math.max(1, Math.ceil((support.expiresAt.getTime() - Date.now()) / 60_000)),
      );
    }
    let membership = null;
    if (session.tenantId && session.membershipId) {
      membership = await this.prisma.membership.findFirst({
        where: {
          id: session.membershipId,
          tenantId: session.tenantId,
          userId: user.id,
          active: true,
        },
      });
      if (!membership) throw new ForbiddenException('Membresía inactiva.');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(
      user,
      membership,
      session.supportSessionId
        ? { supportSessionId: session.supportSessionId, readOnly: true }
        : undefined,
    );
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: auth.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const memberships = await this.membershipViews(user.id);
    let current = memberships.find((m) => m.tenantId === auth.tenantId) ?? null;
    if (!current && auth.tenantId && auth.supportSessionId) {
      const store = await this.prisma.store.findUnique({
        where: { id: auth.tenantId },
        select: {
          id: true,
          name: true,
          status: true,
          businessType: true,
          plan: { select: { code: true, name: true, modules: true } },
          enabledModules: true,
        },
      });
      if (store) {
        current = { id: 'support', tenantId: store.id, role: 'OWNER', branchId: null, store };
      }
    }
    return {
      user: this.userView(user),
      role: auth.role,
      permissions: auth.permissions,
      branchId: auth.branchId,
      memberships,
      store: current?.store ?? null,
      platform: Boolean(auth.platformRole),
      platformPermissions: auth.platformPermissions,
      supportSessionId: auth.supportSessionId,
      readOnly: auth.readOnly ?? false,
    };
  }

  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('La confirmación no coincide.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new BadRequestException('La nueva contraseña debe ser diferente.');
    }
    const check = validatePassword(newPassword, user.username);
    if (!check.ok) throw new BadRequestException(check.message);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.session.updateMany({
      where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.adminAudit.create({
      data: {
        actorUserId: user.id,
        action: 'AUTH_PASSWORD_CHANGED',
        targetType: 'User',
        targetId: user.id,
        tenantId: auth.tenantId,
      },
    });
    return { ok: true };
  }

  async changeUsername(auth: AuthContext, currentPassword: string, username: string) {
    const clean = username.trim();
    if (!/^[A-Za-z0-9._-]{4,32}$/.test(clean)) {
      throw new BadRequestException(
        'El usuario debe tener entre 4 y 32 caracteres: letras, números, punto, guion o guion bajo.',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    const exists = await this.prisma.user.findUnique({
      where: { usernameLower: clean.toLowerCase() },
    });
    if (exists && exists.id !== user.id) {
      throw new BadRequestException('Ese nombre de usuario ya está en uso.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { username: clean, usernameLower: clean.toLowerCase() },
    });
    await this.prisma.adminAudit.create({
      data: {
        actorUserId: user.id,
        action: 'AUTH_USERNAME_CHANGED',
        targetType: 'User',
        targetId: user.id,
        tenantId: auth.tenantId,
        before: { username: user.username },
        after: { username: clean },
      },
    });
    return { ok: true, username: clean };
  }

  async preferences(auth: AuthContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
      select: { preferences: true },
    });
    return user?.preferences ?? {};
  }

  async updatePreferences(auth: AuthContext, preferences: Record<string, unknown>) {
    const allowed = [
      'theme',
      'accent',
      'reducedTransparency',
      'reducedMotion',
      'density',
      'posShortcuts',
      'lastBranchId',
      'lastRegisterId',
    ];
    const clean = Object.fromEntries(
      Object.entries(preferences).filter(([key]) => allowed.includes(key)),
    );
    const serialized = JSON.stringify(clean);
    if (serialized.length > 8000) {
      throw new BadRequestException('Las preferencias exceden el tamaño permitido.');
    }
    await this.prisma.user.update({
      where: { id: auth.userId },
      data: { preferences: clean as never },
    });
    return clean;
  }

  async updateProfile(auth: AuthContext, fullName: string, phone?: string) {    const name = fullName.trim();
    if (name.length < 3 || name.length > 120) {
      throw new BadRequestException('El nombre debe tener entre 3 y 120 caracteres.');
    }
    return this.prisma.user.update({
      where: { id: auth.userId },
      data: { fullName: name, phone: phone?.trim() || null },
      select: { id: true, fullName: true, phone: true },
    });
  }

  async requestPasswordReset(email: string, ip?: string): Promise<void> {
    const normalized = this.normalize(email);
    const user = normalized
      ? await this.prisma.user.findUnique({ where: { emailLower: normalized } })
      : null;
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomToken(40);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    const url = `${this.config.get('WEB_PUBLIC_URL', { infer: true })}/#/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.queue(
      user.email!,
      'Recuperación de acceso a Saldio POS',
      `Hola ${user.fullName}.\n\nRecibimos una solicitud para restablecer tu acceso.\nAbre este enlace de un solo uso (vence en 30 minutos):\n${url}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
    );
    await this.prisma.adminAudit.create({
      data: {
        action: 'AUTH_RESET_REQUESTED',
        targetType: 'User',
        targetId: user.id,
        ip,
      },
    });
  }

  async resetPassword(token: string, password: string, confirm: string) {
    if (password !== confirm) {
      throw new BadRequestException('La confirmación no coincide.');
    }
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('El enlace no es válido o ya venció.');
    }
    const check = validatePassword(password, record.user.username);
    if (!check.ok) throw new BadRequestException(check.message);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await hashPassword(password),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.prisma.adminAudit.create({
      data: {
        action: 'AUTH_PASSWORD_RESET',
        targetType: 'User',
        targetId: record.userId,
      },
    });
    return { ok: true };
  }

  async adminResetPassword(
    actorId: string,
    userId: string,
    reason: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const temporary = randomPassword(14);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(temporary),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.adminAudit.create({
      data: {
        actorUserId: actorId,
        action: 'ADMIN_PASSWORD_RESET',
        targetType: 'User',
        targetId: userId,
        reason,
        ip,
      },
    });
    // Se devuelve una sola vez; no se almacena en claro.
    return { temporaryPassword: temporary, mustChangePassword: true };
  }
}
