#!/usr/bin/env node
/**
 * Genera un catálogo de prueba para medir listados. Solo desarrollo.
 * No usar en producción.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const total = Number(process.env.PERF_PRODUCTS ?? 10000);

async function main() {
  const store = await prisma.store.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!store) throw new Error('No hay tienda activa para la prueba');
  const tenantId = store.id;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.platform', 'on', true)`);
    const unit = await tx.unit.findFirst({ where: { tenantId, code: 'UND' } });
    const tax = await tx.tax.findFirst({ where: { tenantId, code: 'IVA19' } });
    if (!unit || !tax) throw new Error('La tienda no tiene unidad/impuesto base');
    await tx.product.deleteMany({ where: { tenantId, sku: { startsWith: 'PERF-' } } });
    const batchSize = 1000;
    for (let offset = 0; offset < total; offset += batchSize) {
      const rows = Array.from({ length: Math.min(batchSize, total - offset) }, (_, i) => {
        const n = offset + i + 1;
        return {
          tenantId,
          sku: `PERF-${String(n).padStart(6, '0')}`,
          name: `Producto de rendimiento ${n}`,
          barcode: `PERF${String(n).padStart(9, '0')}`,
          unitId: unit.id,
          taxId: tax.id,
          price: String(1000 + (n % 9000)),
          cost: String(500 + (n % 4000)),
          type: 'SIMPLE',
          trackInventory: true,
        };
      });
      await tx.product.createMany({ data: rows });
    }
    const count = await tx.product.count({ where: { tenantId } });
    console.log(`[perf] tenant=${tenantId} productos=${count}`);
  }, { timeout: 180_000, maxWait: 20_000 });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
