import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { dec } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  encryptSecret,
  hmacSha256,
  safeEqualHex,
  uuid,
} from '../common/security';
import type { Env } from '../config/env';
import type { AuthContext, AuthenticatedRequest } from '../common/guards';
import type { FiscalConfigDto, PaymentAccountDto } from './integrations.dto';

interface PaymentEventBody {
  id?: string;
  type?: string;
  tenantId?: string;
  amount?: string;
  currency?: string;
  accountRef?: string;
  reference?: string;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger('Integrations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async status(_auth: AuthContext) {
    const tenantId = this.prisma.tenantId!;
    const rows = await this.prisma.db.integrationConfig.findMany({
      where: { tenantId },
    });
    const fiscal = rows.find((r) => r.kind === 'FISCAL');
    const payments = rows.find((r) => r.kind === 'PAYMENTS');
    return {
      fiscal: {
        provider: fiscal?.provider ?? this.config.get('FISCAL_PROVIDER', { infer: true }),
        mode: fiscal?.mode ?? this.config.get('FISCAL_MODE', { infer: true }),
        status: fiscal?.status ?? 'NOT_CONFIGURED',
        enabled: fiscal?.status === 'CONFIGURED' && fiscal?.provider !== 'disabled',
        note: 'Sin credenciales productivas se opera exclusivamente en modo prueba.',
        dian:
          'El comprobante interno no es una factura electrónica validada por la DIAN. No se genera CUFE.',
      },
      payments: {
        provider: payments?.provider ?? this.config.get('PAYMENTS_PROVIDER', { infer: true }),
        mode: payments?.mode ?? this.config.get('PAYMENTS_MODE', { infer: true }),
        status: payments?.status ?? 'NOT_CONFIGURED',
        webhookConfigured: Boolean(
          this.config.get('PAYMENTS_WEBHOOK_SECRET', { infer: true }),
        ),
        note: 'Los cobros requieren eventos firmados y conciliación en servidor.',
      },
      accounts: await this.prisma.db.storePaymentAccount.findMany({
        where: { tenantId },
        select: {
          id: true,
          provider: true,
          accountRef: true,
          currency: true,
          mode: true,
          active: true,
        },
      }),
    };
  }

  async setFiscalConfig(auth: AuthContext, dto: FiscalConfigDto) {
    if (dto.mode === 'PRODUCTION' && dto.provider !== 'provider') {
      throw new BadRequestException(
        'No se puede activar producción sin un proveedor fiscal autorizado y credenciales.',
      );
    }
    let encrypted: string | null = null;
    if (dto.apiKey || dto.apiSecret) {
      const key = this.config.get('CONFIG_ENCRYPTION_KEY', { infer: true });
      if (!key) {
        throw new BadRequestException(
          'Configure CONFIG_ENCRYPTION_KEY antes de guardar credenciales de integración.',
        );
      }
      encrypted = encryptSecret(
        key,
        JSON.stringify({ apiKey: dto.apiKey, apiSecret: dto.apiSecret }),
      );
    }
    const provider =
      dto.provider === 'disabled' ? 'disabled' : dto.providerName || dto.provider;
    const row = await this.prisma.db.integrationConfig.upsert({
      where: {
        tenantId_kind_provider: {
          tenantId: this.prisma.tenantId!,
          kind: 'FISCAL',
          provider,
        },
      },
      update: {
        mode: dto.mode,
        status: provider === 'disabled' ? 'NOT_CONFIGURED' : 'CONFIGURED',
        encryptedConfig: encrypted,
        lastError: null,
      },
      create: {
        tenantId: this.prisma.tenantId!,
        kind: 'FISCAL',
        provider,
        mode: dto.mode,
        status: provider === 'disabled' ? 'NOT_CONFIGURED' : 'CONFIGURED',
        encryptedConfig: encrypted,
      },
    });
    await this.audit.tenant(auth, {
      action: 'FISCAL_CONFIG_UPDATED',
      entityType: 'IntegrationConfig',
      entityId: row.id,
      after: { provider, mode: dto.mode, credentials: Boolean(encrypted) },
    });
    return { id: row.id, provider, mode: row.mode, status: row.status };
  }

  async addPaymentAccount(auth: AuthContext, dto: PaymentAccountDto) {
    const account = await this.prisma.db.storePaymentAccount.upsert({
      where: {
        tenantId_provider_accountRef: {
          tenantId: this.prisma.tenantId!,
          provider: dto.provider,
          accountRef: dto.accountRef,
        },
      },
      update: {
        currency: dto.currency ?? 'COP',
        mode: dto.mode ?? 'TEST',
        active: dto.active ?? true,
      },
      create: {
        tenantId: this.prisma.tenantId!,
        provider: dto.provider,
        accountRef: dto.accountRef,
        currency: dto.currency ?? 'COP',
        mode: dto.mode ?? 'TEST',
        active: dto.active ?? true,
      },
    });
    await this.audit.tenant(auth, {
      action: 'PAYMENT_ACCOUNT_UPSERTED',
      entityType: 'StorePaymentAccount',
      entityId: account.id,
      after: { provider: dto.provider, accountRef: dto.accountRef, mode: account.mode },
    });
    return account;
  }

  async fiscalDocuments() {
    return this.prisma.db.fiscalDocument.findMany({
      where: { tenantId: this.prisma.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async submitFiscal(auth: AuthContext, saleId: string) {
    const tenantId = this.prisma.tenantId!;
    const [sale, config] = await Promise.all([
      this.prisma.db.sale.findFirst({ where: { id: saleId, tenantId } }),
      this.prisma.db.integrationConfig.findFirst({
        where: { tenantId, kind: 'FISCAL' },
      }),
    ]);
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    if (!config || config.provider === 'disabled' || config.status !== 'CONFIGURED') {
      throw new BadRequestException({
        code: 'FISCAL_NOT_CONFIGURED',
        message:
          'La facturación electrónica no está configurada. Configure un proveedor autorizado; no se generará un documento fiscal simulado como válido.',
      });
    }
    if (config.mode === 'PRODUCTION') {
      throw new BadRequestException({
        code: 'FISCAL_PRODUCTION_NOT_AUTHORIZED',
        message:
          'No hay credenciales productivas verificadas ni adaptador certificado. El envío productivo está bloqueado.',
      });
    }
    const existing = await this.prisma.db.fiscalDocument.findFirst({
      where: { tenantId, saleId, provider: config.provider },
    });
    if (existing) return existing;
    const doc = await this.prisma.db.fiscalDocument.create({
      data: {
        tenantId,
        saleId,
        provider: config.provider,
        mode: 'TEST',
        status: 'TEST_SENT',
        reference: `TEST-${uuid().slice(0, 8).toUpperCase()}`,
        cufe: null,
        payload: {
          testMode: true,
          note: 'Documento de prueba. No es una factura electrónica validada por la DIAN ni contiene CUFE real.',
          saleNumber: sale.number,
          total: sale.total.toString(),
        } as never,
      },
    });
    await this.prisma.db.integrationLog.create({
      data: {
        tenantId,
        kind: 'FISCAL',
        provider: config.provider,
        status: 'TEST_SENT',
        message: 'Envío de prueba; no constituye validación fiscal.',
        detail: { saleId, documentId: doc.id } as never,
      },
    });
    await this.audit.tenant(auth, {
      action: 'FISCAL_TEST_SUBMITTED',
      entityType: 'FiscalDocument',
      entityId: doc.id,
      after: { saleId, status: doc.status, cufe: null },
    });
    return doc;
  }

  async handlePaymentWebhook(
    provider: string,
    request: AuthenticatedRequest,
  ) {
    const raw = request.rawBody;
    if (!raw) throw new BadRequestException('Cuerpo sin procesar requerido.');
    const secret = this.config.get('PAYMENTS_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      throw new UnauthorizedException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'El secreto del webhook no está configurado.',
      });
    }
    const signature = String(request.headers['x-saldio-signature'] ?? '');
    const expected = hmacSha256(secret, raw.toString('utf8'));
    if (!signature || !safeEqualHex(expected, signature)) {
      await this.prisma.withPlatform(() =>
        this.prisma.db.integrationLog.create({
          data: {
            kind: 'PAYMENTS',
            provider,
            status: 'SIGNATURE_INVALID',
            message: 'Evento rechazado por firma inválida.',
          },
        }),
      );
      throw new UnauthorizedException('Firma de evento inválida.');
    }
    let body: PaymentEventBody;
    try {
      body = JSON.parse(raw.toString('utf8')) as PaymentEventBody;
    } catch {
      throw new BadRequestException('Evento inválido.');
    }
    if (!body.id || !body.type) throw new BadRequestException('Evento incompleto.');
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { provider_eventId: { provider, eventId: body.id } },
    });
    if (existing) {
      return { ok: true, duplicate: true, eventId: body.id };
    }
    let result = 'received';
    if (body.tenantId && body.type === 'payment.succeeded') {
      const account = await this.prisma.withPlatform(() =>
        this.prisma.db.storePaymentAccount.findFirst({
          where: {
            tenantId: body.tenantId,
            provider,
            accountRef: body.accountRef ?? '',
            active: true,
          },
        }),
      );
      if (!account) {
        result = 'account_not_found';
      } else {
        const expectedCurrency = account.currency;
        if (
          body.currency &&
          body.currency.toUpperCase() !== expectedCurrency.toUpperCase()
        ) {
          result = 'currency_mismatch';
        } else if (body.amount && dec(body.amount).lte(0)) {
          result = 'invalid_amount';
        } else {
          result = 'reconciled';
        }
      }
    }
    const event = await this.prisma.paymentEvent.create({
      data: {
        provider,
        eventId: body.id,
        eventType: body.type,
        tenantId: body.tenantId,
        payload: body as never,
        signatureOk: true,
        processedAt: new Date(),
        result,
      },
    });
    if (body.tenantId) {
      await this.prisma.withPlatform(() =>
        this.prisma.db.integrationLog.create({
          data: {
            tenantId: body.tenantId,
            kind: 'PAYMENTS',
            provider,
            status: result,
            message: `Evento ${body.type} procesado`,
            detail: { eventId: event.id, reference: body.reference } as never,
          },
        }),
      );
    }
    this.logger.log(`Evento ${provider}/${body.id}: ${result}`);
    return { ok: true, result, mode: this.config.get('PAYMENTS_MODE', { infer: true }) };
  }
}
