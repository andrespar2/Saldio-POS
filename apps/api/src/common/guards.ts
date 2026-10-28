import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PlatformPermission, PlatformRole, Permission, TenantRole } from '@saldio/shared';
import { PERMISSIONS, ROLE_PERMISSIONS, SECTOR_MODULES, GLOBAL_ADDON_MODULES } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './decorators';
import type { Env } from '../config/env';

export interface AuthContext {
  userId: string;
  username: string;
  fullName: string;
  sessionId: string;
  platformRole?: PlatformRole;
  platformPermissions: string[];
  tenantId?: string;
  membershipId?: string;
  role?: TenantRole;
  permissions: string[];
  branchId?: string | null;
  mustChangePassword: boolean;
  supportSessionId?: string;
  readOnly?: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  rawBody?: Buffer;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  tenantId?: string;
  membershipId?: string;
  role?: TenantRole;
  platformRole?: PlatformRole;
  supportSessionId?: string;
  readOnly?: boolean;
  scope: 'access';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sesión requerida.');
    }
    const token = header.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('La sesión expiró o no es válida.');
    }
    if (payload.scope !== 'access') {
      throw new UnauthorizedException('Token no válido para esta operación.');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('La sesión fue revocada.');
    }
    const user = session.user;
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('La cuenta está deshabilitada.');
    }
    if (session.tenantId && payload.tenantId && session.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Contexto de sesión inconsistente.');
    }
    const auth: AuthContext = {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      sessionId: session.id,
      platformRole: user.platformRole ?? undefined,
      platformPermissions: user.platformPermissions,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      role: payload.role,
      permissions: [],
      mustChangePassword: user.mustChangePassword,
      supportSessionId: payload.supportSessionId,
      readOnly: payload.readOnly,
    };
    if (payload.tenantId) {
      if (payload.supportSessionId) {
        const support = await this.prisma.supportSession.findUnique({
          where: { id: payload.supportSessionId },
        });
        if (
          !support ||
          support.status !== 'ACTIVE' ||
          support.revokedAt ||
          support.expiresAt < new Date() ||
          support.tenantId !== payload.tenantId ||
          support.adminUserId !== user.id
        ) {
          throw new ForbiddenException({
            code: 'SUPPORT_SESSION_EXPIRED',
            message: 'La sesión de soporte expiró o fue revocada.',
          });
        }
        auth.role = 'OWNER';
        auth.permissions = [...PERMISSIONS];
        auth.readOnly = true;
        auth.supportSessionId = support.id;
      } else {
        const membership = await this.prisma.membership.findFirst({
          where: {
            id: payload.membershipId,
            tenantId: payload.tenantId,
            userId: user.id,
            active: true,
          },
        });
        if (!membership) {
          throw new ForbiddenException('La membresía de esta tienda ya no está activa.');
        }
        auth.role = membership.role;
        auth.branchId = membership.branchId;
        auth.permissions = Array.from(
          new Set([...ROLE_PERMISSIONS[membership.role], ...membership.permissions]),
        );
      }
    }
    request.auth = auth;

    const allowedWhilePasswordChange = [
      '/api/v1/auth/me',
      '/api/v1/auth/change-password',
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
    ];
    const path = request.path ?? request.url.split('?')[0];
    if (user.mustChangePassword && !allowedWhilePasswordChange.includes(path ?? '')) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debe cambiar la contraseña inicial antes de continuar.',
      });
    }
    return true;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth?.tenantId || !auth.role) {
      throw new ForbiddenException({
        code: 'TENANT_REQUIRED',
        message: 'Seleccione una tienda para continuar.',
      });
    }
    if (auth.readOnly && !['GET', 'HEAD'].includes(request.method)) {
      throw new ForbiddenException({
        code: 'SUPPORT_READ_ONLY',
        message: 'La sesión de soporte es de solo lectura.',
      });
    }
    const store = await this.prisma.store.findUnique({
      where: { id: auth.tenantId },
      select: {
        id: true,
        status: true,
        name: true,
        suspensionEndsAt: true,
        suspensionReason: true,
        email: true,
        phone: true,
      },
    });
    if (!store) throw new ForbiddenException('Tienda no encontrada.');
    if (store.status !== 'ACTIVE') {
      const code =
        store.status === 'PENDING'
          ? 'STORE_PENDING'
          : store.status === 'SUSPENDED'
            ? 'STORE_SUSPENDED'
            : 'STORE_DISABLED';
      throw new ForbiddenException({
        code,
        status: store.status,
        message:
          store.status === 'PENDING'
            ? 'La tienda está pendiente de aprobación. Escríbanos a soporte@saldio.app.'
            : store.status === 'SUSPENDED'
              ? `La tienda está suspendida temporalmente. Motivo: ${store.suspensionReason ?? 'no informado'}. Soporte: soporte@saldio.app`
              : 'La tienda está deshabilitada permanentemente. Contacte a soporte@saldio.app.',
      });
    }
    const required = this.reflector.getAllAndOverride<Permission[]>(
      'tenantPermissions',
      [context.getHandler(), context.getClass()],
    );
    if (required?.length) {
      const missing = required.filter((p) => !auth.permissions.includes(p));
      if (missing.length) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'No tiene permiso para realizar esta acción.',
          missing,
        });
      }
    }
    const moduleCode = this.reflector.getAllAndOverride<string>('tenantModule', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (moduleCode) {
      const store = await this.prisma.store.findUnique({
        where: { id: auth.tenantId },
        select: {
          businessType: true,
          enabledModules: true,
          plan: { select: { modules: true } },
        },
      });
      const sectorModules = new Set<string>([
        ...(SECTOR_MODULES[store?.businessType ?? 'GENERAL'] ?? []),
        ...GLOBAL_ADDON_MODULES,
      ]);
      const contracted = new Set<string>([
        ...(store?.plan?.modules ?? []),
        ...(store?.enabledModules ?? []),
      ]);
      const available = new Set(
        [...contracted].filter((m) => sectorModules.has(m)),
      );
      available.add('CORE');
      if (!available.has(moduleCode)) {
        throw new ForbiddenException({
          code: 'MODULE_NOT_CONTRACTED',
          message: 'El módulo no está habilitado para esta tienda.',
          module: moduleCode,
        });
      }
    }
    return true;
  }
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth?.platformRole) {
      throw new ForbiddenException({
        code: 'PLATFORM_REQUIRED',
        message: 'Acceso exclusivo para administración de la plataforma.',
      });
    }
    if (auth.tenantId) {
      throw new ForbiddenException({
        code: 'PLATFORM_CONTEXT_REQUIRED',
        message: 'Ingrese al panel de administración sin contexto de tienda.',
      });
    }
    const required = this.reflector.getAllAndOverride<PlatformPermission[]>(
      'platformPermissions',
      [context.getHandler(), context.getClass()],
    );
    if (required?.length) {
      const missing = required.filter(
        (p) => !auth.platformPermissions.includes(p),
      );
      if (missing.length) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'No tiene permiso administrativo para esta acción.',
          missing,
        });
      }
    }
    return true;
  }
}
