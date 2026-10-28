#!/usr/bin/env node
/**
 * PostgreSQL local embebido para desarrollo en Windows.
 * No sustituye a un PostgreSQL gestionado en produccion.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, '.local', 'pgdata');
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const appUser = 'saldio';
const appPassword = 'saldio';
const database = 'saldio';

mkdirSync(path.dirname(dataDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: (message) => {
    if (process.env.DEBUG_PG) console.log(message);
  },
  onError: (error) => {
    if (process.env.DEBUG_PG) console.error(error);
  },
});

async function ensureRoleAndDatabase() {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
    if (role.rowCount === 0) {
      await client.query(`CREATE ROLE ${appUser} LOGIN PASSWORD '${appPassword}' CREATEDB`);
    }
    const db = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (db.rowCount === 0) {
      await client.query(`CREATE DATABASE ${database} OWNER ${appUser}`);
    }
  } finally {
    await client.end();
  }
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`Fallo: ${command} ${args.join(' ')}`);
}

async function main() {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('[db] inicializando cluster local...');
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (error) {
    console.error('[db] no se pudo iniciar. Si ya esta en ejecucion, use esa instancia.', error);
    process.exitCode = 1;
    return;
  }
  await ensureRoleAndDatabase();
  const url = `postgresql://${appUser}:${appPassword}@localhost:${port}/${database}?schema=public`;
  console.log(`[db] PostgreSQL escuchando en localhost:${port}/${database}`);
  if (process.argv.includes('--migrate')) {
    console.log('[db] aplicando migraciones...');
    run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], {
      DATABASE_URL: url,
      DIRECT_URL: url,
    });
  }
  console.log('[db] listo. Ctrl+C para detener.');
  const shutdown = async () => {
    console.log('\n[db] deteniendo...');
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => undefined);
}

main().catch(async (error) => {
  console.error(error);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
