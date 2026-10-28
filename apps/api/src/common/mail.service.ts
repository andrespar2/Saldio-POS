import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    const host = this.config.get('SMTP_HOST', { infer: true });
    this.from = this.config.get('MAIL_FROM', { infer: true });
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: this.config.get('SMTP_PORT', { infer: true }),
          secure: this.config.get('SMTP_SECURE', { infer: true }),
          auth: this.config.get('SMTP_USER', { infer: true })
            ? {
                user: this.config.get('SMTP_USER', { infer: true }),
                pass: this.config.get('SMTP_PASSWORD', { infer: true }),
              }
            : undefined,
        })
      : null;
  }

  get configured(): boolean {
    return Boolean(this.transporter);
  }

  async queue(to: string, subject: string, body: string): Promise<string> {
    const record = await this.prisma.emailOutbox.create({
      data: { to, subject, body },
    });
    if (this.transporter) {
      await this.deliver(record.id).catch((error) => {
        this.logger.warn(`Correo ${record.id} quedó pendiente: ${String(error)}`);
      });
    }
    return record.id;
  }

  async deliver(id: string): Promise<void> {
    const mail = await this.prisma.emailOutbox.findUnique({ where: { id } });
    if (!mail || mail.status === 'SENT' || !this.transporter) return;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.body,
      });
      await this.prisma.emailOutbox.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
    } catch (error) {
      await this.prisma.emailOutbox.update({
        where: { id },
        data: { status: 'FAILED', error: String(error).slice(0, 500) },
      });
      throw error;
    }
  }

  async retryPending(limit = 20): Promise<number> {
    if (!this.transporter) return 0;
    const pending = await this.prisma.emailOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let sent = 0;
    for (const mail of pending) {
      try {
        await this.deliver(mail.id);
        sent += 1;
      } catch {
        // El error queda registrado en la bandeja de salida.
      }
    }
    return sent;
  }
}
