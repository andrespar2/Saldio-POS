#!/usr/bin/env node
/**
 * Ejecuta la suite de integración contra un PostgreSQL real y efímero.
 * En CI se puede definir TEST_DATABASE_URL para usar un servicio PostgreSQL.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 55000 + Math.floor(Math.random() * 500);
const user = 'saldio_test';
const password = 'saldio_test';
const database = 'saldio_test';
const dataDir = path.join(root, '.local', `pgtest-${process.pid}`);
const externalUrl = process.env.TEST_DATABASE_URL;

let pg = null;

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`Falló: ${command} ${args.join(' ')}`);
}

async function startLocal() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(path.dirname(dataDir), { recursive: true });
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  try {
    await client.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}' CREATEDB`);
    await client.query(`CREATE DATABASE ${database} OWNER ${user}`);
  } finally {
    await client.end();
  }
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;
}

async function main() {
  const databaseUrl = externalUrl || (await startLocal());
  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'test-secret-saldio-pos-1234567890-abcdefghijklmnop',
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL_DAYS: '30',
    FILE_SIGNING_SECRET: 'test-file-signing-secret-saldio',
    CONFIG_ENCRYPTION_KEY: 'a'.repeat(64),
    STORAGE_DIR: path.join(root, '.local', 'test-uploads'),
    WEB_PUBLIC_URL: 'http://localhost:5173',
    API_PUBLIC_URL: 'http://localhost:3000',
    CORS_ORIGINS: 'http://localhost:5173,saldio://app',
    BOOTSTRAP_ENABLED: 'false',
    AUTO_APPROVE_STORES: 'false',
    PAYMENTS_WEBHOOK_SECRET: 'test-webhook-secret',
    PAYMENTS_MODE: 'test',
    FISCAL_MODE: 'test',
    FISCAL_PROVIDER: 'disabled',
    SUPPORT_SESSION_MINUTES: '30',
  };
  console.log('[test] aplicando migraciones en la base de pruebas…');
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], env);
  console.log('[test] cargando planes…');
  run('npx', ['tsx', 'apps/api/prisma/seed.ts'], env);
  console.log('[test] ejecutando integración…');
  const result = spawnSync(
    'npx',
    ['jest', '--config', 'apps/api/jest.integration.config.js', '--runInBand'],
    {
      cwd: root,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      env: { ...process.env, ...env },
    },
  );
  process.exitCode = result.status ?? 1;
}

main()
  .catch((error) => {
    console.error('[test] error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pg) await pg.stop().catch(() => undefined);
  });
