/**
 * Datos base de la plataforma. No crea tiendas ni contrasenas.
 * Los administradores iniciales se crean con prisma/bootstrap.ts.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const plans = [
  {
    code: 'BASICO',
    name: 'Básico',
    description: 'Operación esencial de punto de venta e inventario.',
    price: new Prisma.Decimal(49900),
    modules: [
      'CORE',
      'POS',
      'INVENTORY',
      'CUSTOMERS',
      'CASH',
      'REPORTS',
      'RETURNS',
      'EXPENSES',
      'EXPORTS',
    ],
    limits: { users: 3, branches: 1, products: 800, registers: 1 },
  },
  {
    code: 'PROFESIONAL',
    name: 'Profesional',
    description: 'Compras, cartera, variantes y reportes avanzados.',
    price: new Prisma.Decimal(89900),
    modules: [
      'CORE',
      'POS',
      'INVENTORY',
      'PURCHASES',
      'SUPPLIERS',
      'CUSTOMERS',
      'CASH',
      'REPORTS',
      'RETURNS',
      'EXPENSES',
      'CREDITS',
      'QUOTES',
      'VARIANTS',
      'LOTS',
      'EMPLOYEES',
      'EXPORTS',
    ],
    limits: { users: 10, branches: 3, products: 10000, registers: 5 },
  },
  {
    code: 'EMPRESARIAL',
    name: 'Empresarial',
    description: 'Sectores especializados, contabilidad e integraciones.',
    price: new Prisma.Decimal(159900),
    modules: [
      'CORE',
      'POS',
      'INVENTORY',
      'PURCHASES',
      'SUPPLIERS',
      'CUSTOMERS',
      'CASH',
      'REPORTS',
      'RETURNS',
      'EXPENSES',
      'CREDITS',
      'QUOTES',
      'VARIANTS',
      'LOTS',
      'RECIPES',
      'RESTAURANT',
      'KITCHEN',
      'ACCOUNTING',
      'FISCAL',
      'PAYMENTS',
      'MULTIBRANCH',
      'EMPLOYEES',
      'EXPORTS',
    ],
    limits: { users: 50, branches: 20, products: 100000, registers: 30 },
  },
];

const addons = [
  { code: 'ADDON-ACCOUNTING', name: 'Contabilidad', module: 'ACCOUNTING', price: new Prisma.Decimal(39900) },
  { code: 'ADDON-RESTAURANT', name: 'Restaurante y cocina', module: 'RESTAURANT', price: new Prisma.Decimal(29900) },
  { code: 'ADDON-FISCAL', name: 'Facturación electrónica', module: 'FISCAL', price: new Prisma.Decimal(49900) },
  { code: 'ADDON-MULTIBRANCH', name: 'Multi-sucursal', module: 'MULTIBRANCH', price: new Prisma.Decimal(29900) },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        modules: plan.modules,
        limits: plan.limits,
      },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        modules: plan.modules,
        limits: plan.limits,
      },
    });
  }
  for (const addon of addons) {
    await prisma.addon.upsert({
      where: { code: addon.code },
      update: { name: addon.name, module: addon.module, price: addon.price },
      create: addon,
    });
  }
  console.log(`[seed] ${plans.length} planes y ${addons.length} complementos listos.`);
}

main()
  .catch((error) => {
    console.error('[seed] error', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
