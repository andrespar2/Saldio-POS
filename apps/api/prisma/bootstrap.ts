/**
 * Bootstrap idempotente de los dos administradores iniciales.
 *
 * Requisitos:
 * - BOOTSTRAP_ENABLED=true
 * - Variables BOOTSTRAP_ADMIN_N_* definidas en el entorno local/despliegue.
 *
 * Las contrasenas nunca se escriben en logs, repositorio ni artefactos.
 * Si ya existe cualquier administrador de plataforma, este script no crea ni
 * restablece cuentas. El marcador bootstrap.completed impide reutilizarlo.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/common/security';
import { PLATFORM_ROLE_PERMISSIONS } from '@saldio/shared';

const prisma = new PrismaClient();

interface BootstrapAdmin {
  name?: string;
  username?: string;
  password?: string;
}

function readAdmins(): BootstrapAdmin[] {
  return [1, 2].map((i) => ({
    name: process.env[`BOOTSTRAP_ADMIN_${i}_NAME`],
    username: process.env[`BOOTSTRAP_ADMIN_${i}_USERNAME`],
    password: process.env[`BOOTSTRAP_ADMIN_${i}_PASSWORD`],
  }));
}

async function main() {
  if (process.env.BOOTSTRAP_ENABLED !== 'true') {
    console.log('[bootstrap] deshabilitado (BOOTSTRAP_ENABLED != true).');
    return;
  }
  const marker = await prisma.systemSetting.findUnique({
    where: { key: 'bootstrap.completed' },
  });
  if (marker) {
    console.log('[bootstrap] ya fue utilizado. No se realizan cambios.');
    return;
  }
  const existing = await prisma.user.count({ where: { isPlatformAdmin: true } });
  if (existing > 0) {
    await prisma.systemSetting.upsert({
      where: { key: 'bootstrap.completed' },
      update: { value: { completedAt: new Date().toISOString(), skipped: true } as Prisma.InputJsonValue },
      create: {
        key: 'bootstrap.completed',
        value: { completedAt: new Date().toISOString(), skipped: true } as Prisma.InputJsonValue,
      },
    });
    console.log('[bootstrap] ya existen administradores. No se restablece nada.');
    return;
  }
  const admins = readAdmins();
  const invalid = admins.filter(
    (a) => !a.name || !a.username || !a.password || a.password.length < 10,
  );
  if (invalid.length) {
    throw new Error(
      'Faltan variables BOOTSTRAP_ADMIN_N_* o la contrasena tiene menos de 10 caracteres.',
    );
  }
  await prisma.$transaction(async (tx) => {
    for (const admin of admins) {
      const username = admin.username!.trim();
      const usernameLower = username.toLowerCase();
      const email = `${usernameLower}@bootstrap.invalid`;
      const user = await tx.user.create({
        data: {
          username,
          usernameLower,
          email,
          emailLower: email,
          fullName: admin.name!.trim(),
          passwordHash: await hashPassword(admin.password!),
          isPlatformAdmin: true,
          platformRole: 'SUPER_ADMIN',
          platformPermissions: PLATFORM_ROLE_PERMISSIONS.SUPER_ADMIN,
          mustChangePassword: true,
        },
      });
      await tx.adminAudit.create({
        data: {
          actorUserId: user.id,
          action: 'BOOTSTRAP_ADMIN_CREATED',
          targetType: 'User',
          targetId: user.id,
          after: { username, mustChangePassword: true },
        },
      });
    }
    await tx.systemSetting.create({
      data: {
        key: 'bootstrap.completed',
        value: { completedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
  });
  console.log(`[bootstrap] ${admins.length} administradores creados. Cambio de contraseña obligatorio.`);
}

main()
  .catch((error) => {
    console.error('[bootstrap] error:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
