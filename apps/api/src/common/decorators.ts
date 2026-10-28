import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PlatformPermission, Permission } from '@saldio/shared';
import type { AuthContext, AuthenticatedRequest } from './guards';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new Error('Contexto de autenticación no disponible');
    return request.auth;
  },
);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata('tenantPermissions', permissions);

export const RequireModule = (moduleCode: string) =>
  SetMetadata('tenantModule', moduleCode);

export const RequirePlatform = (...permissions: PlatformPermission[]) =>
  SetMetadata('platformPermissions', permissions);
