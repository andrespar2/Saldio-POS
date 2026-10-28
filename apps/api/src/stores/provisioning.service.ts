import { Injectable } from '@nestjs/common';
import type { BusinessType, ModuleCode } from '@saldio/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea la operacion minima de una tienda. Debe ejecutarse con contexto. */
  async ensureDefaults(
    tenantId: string,
    businessType: BusinessType,
    modules: ModuleCode[] = [],
  ): Promise<void> {
    const db = this.prisma.db;
    let branch = await db.branch.findFirst({ where: { tenantId } });
    if (!branch) {
      branch = await db.branch.create({
        data: {
          tenantId,
          name: 'Sucursal principal',
          code: 'MATRIZ',
          address: 'Pendiente de completar',
          city: 'Pendiente',
        },
      });
    }
    const warehouse =
      (await db.warehouse.findFirst({ where: { tenantId, branchId: branch.id } })) ??
      (await db.warehouse.create({
        data: {
          tenantId,
          branchId: branch.id,
          name: 'Bodega principal',
          code: 'BODEGA',
        },
      }));
    await db.register.upsert({
      where: { tenantId_code: { tenantId, code: 'CAJA-01' } },
      update: {},
      create: {
        tenantId,
        branchId: branch.id,
        name: 'Caja 1',
        code: 'CAJA-01',
      },
    });
    const taxes = [
      { code: 'IVA19', name: 'IVA 19%', rate: 19 },
      { code: 'IVA5', name: 'IVA 5%', rate: 5 },
      { code: 'EXENTO', name: 'Exento', rate: 0 },
    ];
    for (const tax of taxes) {
      const exists = await db.tax.findFirst({
        where: { tenantId, code: tax.code },
      });
      if (!exists) {
        await db.tax.create({
          data: { tenantId, name: tax.name, code: tax.code, rate: tax.rate },
        });
      }
    }
    const units = [
      { code: 'UND', name: 'Unidad', allowDecimal: false },
      { code: 'KG', name: 'Kilogramo', allowDecimal: true },
      { code: 'L', name: 'Litro', allowDecimal: true },
    ];
    for (const unit of units) {
      const exists = await db.unit.findFirst({
        where: { tenantId, code: unit.code },
      });
      if (!exists) {
        await db.unit.create({
          data: {
            tenantId,
            name: unit.name,
            code: unit.code,
            allowDecimal: unit.allowDecimal,
          },
        });
      }
    }
    const tasks = [
      { key: 'branch', completed: true },
      { key: 'warehouse', completed: true },
      { key: 'cash', completed: true },
      { key: 'taxes', completed: true },
      { key: 'products', completed: false },
      { key: 'employees', completed: false },
      { key: 'suppliers', completed: false },
      ...(businessType === 'RESTAURANT'
        ? [{ key: 'tables', completed: false }]
        : []),
    ];
    for (const task of tasks) {
      await db.onboardingTask.upsert({
        where: { tenantId_key: { tenantId, key: task.key } },
        update: {},
        create: {
          tenantId,
          key: task.key,
          completed: task.completed,
          completedAt: task.completed ? new Date() : null,
        },
      });
    }
    // Reserva de bodega principal para no depender de otra consulta.
    void warehouse;
    void modules;
  }
}
