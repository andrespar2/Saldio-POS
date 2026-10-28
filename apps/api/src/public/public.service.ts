import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { BusinessType } from '@saldio/shared';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
  SECTOR_MODULES,
  isBusinessType,
} from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, validatePassword } from '../common/security';
import { AuditService } from '../common/audit.service';
import { StoreProvisioningService } from '../stores/provisioning.service';
import { StorageService } from '../common/storage.service';
import { SettingsService } from '../common/settings.service';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { registerSchema } from './register.schema';

@Injectable()
export class PublicService {
  private readonly logger = new Logger('Public');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provisioning: StoreProvisioningService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async plans() {
    const plans = await this.prisma.plan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { price: 'asc' },
      select: {
        code: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        modules: true,
        limits: true,
      },
    });
    return plans;
  }

  businessTypes() {
    return BUSINESS_TYPES.map((code) => ({
      code,
      label: BUSINESS_TYPE_LABELS[code],
      modules: SECTOR_MODULES[code],
    }));
  }

  async autoApprove(): Promise<boolean> {
    const setting = await this.settings.get<boolean | null>('stores.autoApprove', null);
    return setting ?? this.config.get('AUTO_APPROVE_STORES', { infer: true });
  }

  async register(
    rawBody: Record<string, unknown>,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Revise los datos del formulario.',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const data = parsed.data;
    const check = validatePassword(data.password, data.username);
    if (!check.ok) throw new BadRequestException(check.message);
    const plan = data.planCode
      ? await this.prisma.plan.findUnique({ where: { code: data.planCode } })
      : await this.prisma.plan.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { price: 'asc' },
        });
    if (!plan || plan.status !== 'ACTIVE') {
      throw new BadRequestException('El plan solicitado no está disponible.');
    }
    const emailLower = data.email.toLowerCase();
    const usernameLower = data.username.toLowerCase();
    const duplicateUser = await this.prisma.user.findFirst({
      where: { OR: [{ usernameLower }, { emailLower }] },
      select: { username: true, email: true },
    });
    if (duplicateUser) {
      throw new ConflictException({
        code: 'REGISTRATION_DUPLICATE',
        message:
          duplicateUser.username.toLowerCase() === usernameLower
            ? 'El nombre de usuario ya está en uso.'
            : 'El correo ya está registrado.',
      });
    }
    const duplicateStore = await this.prisma.store.findFirst({
      where: {
        OR: [
          { emailLower },
          ...(data.taxId ? [{ taxId: data.taxId }] : []),
        ],
      },
      select: { email: true, taxId: true },
    });
    if (duplicateStore) {
      throw new ConflictException({
        code: 'REGISTRATION_DUPLICATE',
        message:
          duplicateStore.taxId && duplicateStore.taxId === data.taxId
            ? 'La identificación tributaria ya está registrada.'
            : 'El correo ya tiene una tienda registrada.',
      });
    }
    const autoApprove = await this.autoApprove();
    const businessType = data.businessType as BusinessType;
    const created = await this.prisma.withPlatform(async () => {
      const tx = this.prisma.db;
      const store = await tx.store.create({
        data: {
          name: data.name,
          legalName: data.legalName || null,
          taxType: data.taxType || null,
          taxId: data.taxId || null,
          ownerName: data.ownerName,
          email: data.email,
          emailLower,
          phone: data.phone,
          address: data.address,
          city: data.city,
          businessType,
          status: autoApprove ? 'ACTIVE' : 'PENDING',
          approvedAt: autoApprove ? new Date() : null,
          planId: plan.id,
          contractedModules: plan.modules,
          enabledModules: [],
          limits: plan.limits as never,
          termsAcceptedAt: new Date(),
          onboardingProgress: {} as never,
        },
      });
      const user = await tx.user.create({
        data: {
          username: data.username,
          usernameLower,
          email: data.email,
          emailLower,
          fullName: data.ownerName,
          phone: data.phone,
          passwordHash: await hashPassword(data.password),
        },
      });
      await tx.membership.create({
        data: {
          tenantId: store.id,
          userId: user.id,
          role: 'OWNER',
        },
      });
      await tx.subscription.create({
        data: {
          tenantId: store.id,
          planId: plan.id,
          status: autoApprove ? 'ACTIVE' : 'TRIAL',
        },
      });
      return { store, user };
    });

    if (file?.buffer?.length) {
      try {
        const saved = await this.prisma.withTenant(
          { tenantId: created.store.id, userId: created.user.id },
          () =>
            this.storage.saveImage({
              tenantId: created.store.id,
              userId: created.user.id,
              originalName: file.originalname,
              buffer: file.buffer,
              visibility: 'PUBLIC_LOGO',
            }),
        );
        await this.prisma.store.update({
          where: { id: created.store.id },
          data: { logoKey: saved.id },
        });
      } catch (error) {
        this.logger.warn(`Logo no guardado para ${created.store.id}: ${String(error)}`);
      }
    }

    await this.audit.platform(null, {
      action: 'STORE_REGISTERED',
      entityType: 'Store',
      entityId: created.store.id,
      tenantId: created.store.id,
      reason: 'Autorregistro público',
      after: {
        name: data.name,
        businessType,
        plan: plan.code,
        status: created.store.status,
      },
      ip,
    });

    if (autoApprove) {
      await this.prisma.withPlatform(async () => {
        await this.provisioning.ensureDefaults(
          created.store.id,
          businessType,
          plan.modules as never,
        );
        await this.prisma.db.storeStatusHistory.create({
          data: {
            tenantId: created.store.id,
            from: 'PENDING',
            to: 'ACTIVE',
            reason: 'Aprobación automática configurada',
          },
        });
      });
    }

    return {
      storeId: created.store.id,
      status: created.store.status,
      message: autoApprove
        ? 'Tienda creada y activada. Ya puede iniciar sesión.'
        : 'Solicitud recibida. La tienda quedará pendiente de aprobación y recibirá un correo cuando sea revisada.',
    };
  }

  async logoUrl(storeId: string): Promise<string> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store?.logoKey) throw new NotFoundException('La tienda no tiene logotipo.');
    return this.storage.signedUrl(store.logoKey, store.id, 30);
  }
}
