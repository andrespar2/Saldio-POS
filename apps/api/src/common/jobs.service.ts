import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import type { Job } from '@prisma/client';

@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    options: { tenantId?: string; runAt?: Date } = {},
  ): Promise<string> {
    const job = await this.prisma.job.create({
      data: {
        type,
        payload: payload as never,
        tenantId: options.tenantId,
        runAt: options.runAt ?? new Date(),
      },
    });
    return job.id;
  }

  async claim(): Promise<Job | null> {
    const rows = await this.prisma.$queryRawUnsafe<Job[]>(
      `UPDATE "Job" SET
         "status" = 'RUNNING',
         "lockedAt" = now(),
         "attempts" = "attempts" + 1,
         "updatedAt" = now()
       WHERE "id" = (
         SELECT "id" FROM "Job"
         WHERE ("status" = 'PENDING' AND "runAt" <= now())
            OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '5 minutes')
         ORDER BY "runAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
    );
    return rows[0] ?? null;
  }

  async processOne(): Promise<boolean> {
    const job = await this.claim();
    if (!job) return false;
    try {
      await this.handle(job);
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'DONE', lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = job.attempts >= job.maxAttempts;
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: failed ? 'FAILED' : 'PENDING',
          lastError: message.slice(0, 1000),
          runAt: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 1000)),
          lockedAt: null,
        },
      });
      this.logger.warn(`Trabajo ${job.type} falló: ${message}`);
    }
    return true;
  }

  private async handle(job: Job): Promise<void> {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    switch (job.type) {
      case 'email.send': {
        const emailId = String(payload.emailId ?? '');
        if (!emailId) throw new Error('emailId requerido');
        await this.mail.deliver(emailId);
        return;
      }
      case 'email.retry': {
        await this.mail.retryPending();
        return;
      }
      case 'noop':
        return;
      default:
        throw new Error(`Tipo de trabajo no soportado: ${job.type}`);
    }
  }

  async retry(id: string): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: { status: 'PENDING', runAt: new Date(), lockedAt: null, lastError: null },
    });
  }

  async stats() {
    const [pending, running, failed, done] = await Promise.all([
      this.prisma.job.count({ where: { status: 'PENDING' } }),
      this.prisma.job.count({ where: { status: 'RUNNING' } }),
      this.prisma.job.count({ where: { status: 'FAILED' } }),
      this.prisma.job.count({ where: { status: 'DONE' } }),
    ]);
    return { pending, running, failed, done };
  }

  @Interval(5000)
  async worker(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let processed = 0;
      while (processed < 5 && (await this.processOne())) processed += 1;
    } finally {
      this.running = false;
    }
  }
}
