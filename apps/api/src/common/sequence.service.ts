import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuid } from './security';

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(tenantId: string, scope: string): Promise<number> {
    const rows = await this.prisma.db.$queryRawUnsafe<Array<{ value: number }>>(
      `INSERT INTO "DocumentSequence" ("id", "tenantId", "scope", "value")
       VALUES ($1, $2, $3, 1)
       ON CONFLICT ("tenantId", "scope")
       DO UPDATE SET "value" = "DocumentSequence"."value" + 1
       RETURNING "value"`,
      uuid(),
      tenantId,
      scope,
    );
    return rows[0]?.value ?? 1;
  }

  format(prefix: string, value: number): string {
    return `${prefix}-${String(value).padStart(6, '0')}`;
  }
}
