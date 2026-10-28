import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  tx: Prisma.TransactionClient;
  tenantId?: string;
  userId?: string;
  platform?: boolean;
  readOnly?: boolean;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  get context(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /** Cliente activo: la transaccion de la solicitud o el cliente raiz. */
  get db(): PrismaClient | Prisma.TransactionClient {
    return this.storage.getStore()?.tx ?? this;
  }

  get tenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  get userId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  async withTenant<T>(
    auth: { tenantId: string; userId?: string; readOnly?: boolean },
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!auth.tenantId) throw new Error('Contexto de empresa ausente');
    return this.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.platform', 'off', true)`);
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', $1, true)`,
          auth.tenantId,
        );
        return this.storage.run(
          {
            tx,
            tenantId: auth.tenantId,
            userId: auth.userId,
            platform: false,
            readOnly: auth.readOnly,
          },
          fn,
        );
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  async withPlatform<T>(fn: () => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.platform', 'on', true)`);
        return this.storage.run({ tx, platform: true }, fn);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  /**
   * Ejecuta SQL con contexto de empresa para tareas en segundo plano.
   * No usar para trabajos de multiples empresas en una sola transaccion.
   */
  async withTenantRaw<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withTenant({ tenantId }, () => fn(this.db as Prisma.TransactionClient));
  }
}
