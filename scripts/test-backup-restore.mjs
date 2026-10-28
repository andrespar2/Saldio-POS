#!/usr/bin/env node
/**
 * Prueba de humo de respaldo/restauración con la base local de desarrollo.
 * No usar en producción. Crea y elimina una base temporal.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const bin = fs.existsSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe') ? 'C:/Program Files/PostgreSQL/18/bin' : path.join(root, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const dumpFile = path.join(root, '.local', 'backup-test.dump');
const env = { ...process.env, PGPASSWORD: 'postgres' };
const args = ['-h', 'localhost', '-p', '5433', '-U', 'postgres'];
const run = (command, argv) => {
  const result = spawnSync(path.join(bin, command), argv, { env, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
  return result.stdout;
};

try {
  fs.mkdirSync(path.dirname(dumpFile), { recursive: true });
  run('psql', [...args, '-d', 'postgres', '-c', 'DROP DATABASE IF EXISTS saldio_restore_test']);
  run('psql', [...args, '-d', 'postgres', '-c', 'CREATE DATABASE saldio_restore_test']);
  run('pg_dump', [...args, '-d', 'saldio', '--format=custom', '--no-owner', '--no-privileges', '--file', dumpFile]);
  run('pg_restore', [...args, '-d', 'saldio_restore_test', '--no-owner', '--no-privileges', dumpFile]);
  const stores = run('psql', [...args, '-d', 'saldio_restore_test', '-tA', '-c', 'SELECT count(*) FROM "Store"']).trim();
  const sales = run('psql', [...args, '-d', 'saldio_restore_test', '-tA', '-c', 'SELECT count(*) FROM "Sale"']).trim();
  const products = run('psql', [...args, '-d', 'saldio_restore_test', '-tA', '-c', 'SELECT count(*) FROM "Product"']).trim();
  const rls = run('psql', [...args, '-d', 'saldio_restore_test', '-tA', '-c', "SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_isolation'"]).trim();
  console.log(`[backup] restauración OK: stores=${stores} sales=${sales} products=${products} policies=${rls}`);
  run('psql', [...args, '-d', 'postgres', '-c', 'DROP DATABASE saldio_restore_test']);
} finally {
  fs.rmSync(dumpFile, { force: true });
}
