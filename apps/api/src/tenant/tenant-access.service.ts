import { Injectable } from '@nestjs/common';
import {
  SECTOR_MODULES,
  GLOBAL_ADDON_MODULES,
  resolveAccess,
  type BusinessType,
  type ModuleCode,
  type TenantRole,
} from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage.service';
import type { AuthContext } from '../common/guards';

@Injectable()
export class TenantAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async access(auth: AuthContext) {
    const store = await this.prisma.store.findUnique({
      where: { id: auth.tenantId! },
      include: { plan: true },
    });
    if (!store) throw new Error('Tienda no encontrada');
    const sector = new Set<string>([
      ...(SECTOR_MODULES[store.businessType as BusinessType] ?? []),
      ...GLOBAL_ADDON_MODULES,
    ]);
    const contracted = new Set([
      ...(store.plan?.modules ?? []),
      ...(store.contractedModules ?? []),
      ...(store.enabledModules ?? []),
    ]);
    const effective = [...sector].filter(
      (m) => contracted.has(m) || m === 'CORE' || m === 'POS' || m === 'CASH',
    ) as ModuleCode[];
    const resolved = resolveAccess({
      storeStatus: store.status,
      businessType: store.businessType as BusinessType,
      contractedModules: [...contracted],
      enabledModules: store.enabledModules,
      role: auth.role as TenantRole,
      customPermissions: auth.permissions,
    });
    const [branches, onboarding] = await Promise.all([
      this.prisma.db.branch.findMany({
        where: { tenantId: store.id, active: true },
        select: { id: true, name: true, code: true, city: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.db.onboardingTask.findMany({
        where: { tenantId: store.id },
        orderBy: { key: 'asc' },
      }),
    ]);
    return {
      store: {
        id: store.id,
        name: store.name,
        legalName: store.legalName,
        taxId: store.taxId,
        email: store.email,
        phone: store.phone,
        address: store.address,
        city: store.city,
        businessType: store.businessType,
        status: store.status,
        logoUrl: store.logoKey
          ? this.storage.signedUrl(store.logoKey, store.id, 30)
          : null,
        plan: store.plan
          ? { code: store.plan.code, name: store.plan.name, price: store.plan.price }
          : null,
        limits: store.limits,
        suspensionEndsAt: store.suspensionEndsAt,
        suspensionReason: store.suspensionReason,
      },
      access: {
        allowed: resolved.allowed,
        reason: resolved.reason,
        role: auth.role,
        permissions: Array.from(new Set([...resolved.permissions, ...auth.permissions])),
        modules: Array.from(new Set([...effective, ...resolved.effectiveModules])),
        sectorModules: SECTOR_MODULES[store.businessType as BusinessType] ?? [],
        branchId: auth.branchId,
      },
      branches,
      onboarding: {
        tasks: onboarding,
        completed: store.onboardingDoneAt,
        progress: store.onboardingProgress,
      },
      support: auth.supportSessionId
        ? { active: true, readOnly: true, sessionId: auth.supportSessionId }
        : null,
    };
  }
}
