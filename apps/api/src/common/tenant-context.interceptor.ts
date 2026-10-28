import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { defer, from, lastValueFrom, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './guards';

/**
 * Abre la transaccion y fija app.tenant_id para que RLS aplique.
 * El guard ya valido la membresia; nunca se usa el header del cliente
 * para decidir la empresa.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth?.tenantId) return next.handle();
    return defer(() =>
      from(
        this.prisma.withTenant(
          {
            tenantId: auth.tenantId!,
            userId: auth.userId,
            readOnly: auth.readOnly,
          },
          () => lastValueFrom(next.handle()),
        ),
      ),
    );
  }
}
