import { describe, expect, it } from '@jest/globals';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  hashToken,
  randomPassword,
  signPayload,
  validatePassword,
  verifyPassword,
  verifyPayload,
} from './security';
import { computeLine, computeSaleTotals } from '@saldio/shared';

describe('seguridad de autenticación', () => {
  it('genera y verifica hashes scrypt sin guardar la contraseña', async () => {
    const hash = await hashPassword('ClaveSegura2026!');
    expect(hash).not.toContain('ClaveSegura2026!');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('ClaveSegura2026!', hash)).resolves.toBe(true);
    await expect(verifyPassword('OtraClave2026!', hash)).resolves.toBe(false);
  });

  it('rechaza contraseñas débiles o que contienen el usuario', () => {
    expect(validatePassword('corta').ok).toBe(false);
    expect(validatePassword('sinNumeros').ok).toBe(false);
    expect(validatePassword('usuario1234', 'usuario').ok).toBe(false);
    expect(validatePassword('ClaveSegura2026!').ok).toBe(true);
  });

  it('genera contraseñas temporales con la longitud y clases requeridas', () => {
    const value = randomPassword(14);
    expect(value.length).toBeGreaterThanOrEqual(14);
    expect(/[A-Za-z]/.test(value)).toBe(true);
    expect(/[0-9]/.test(value)).toBe(true);
    expect(validatePassword(value).ok).toBe(true);
  });

  it('firma y verifica enlaces con caducidad', () => {
    const token = signPayload('secreto-de-pruebas', {
      fileId: 'abc',
      exp: Date.now() + 60_000,
    });
    expect(verifyPayload<{ fileId: string; exp: number }>('secreto-de-pruebas', token)?.fileId).toBe('abc');
    expect(verifyPayload('secreto-de-pruebas', `${token}x`)).toBeNull();
    const expired = signPayload('secreto-de-pruebas', { exp: Date.now() - 1 });
    expect(verifyPayload('secreto-de-pruebas', expired)).toBeNull();
  });

  it('cifra configuraciones sensibles con AES-256-GCM', () => {
    const key = 'a'.repeat(64);
    const encrypted = encryptSecret(key, '{"apiKey":"no-visible"}');
    expect(encrypted).not.toContain('no-visible');
    expect(decryptSecret(key, encrypted)).toBe('{"apiKey":"no-visible"}');
  });

  it('hash de token es determinista y no reversible', () => {
    expect(hashToken('token')).toBe(hashToken('token'));
    expect(hashToken('token')).not.toBe('token');
  });
});

describe('motor de importes', () => {
  it('redondea por línea y suma con precisión decimal', () => {
    const totals = computeSaleTotals([
      { quantity: '0.335', unitPrice: '1999.99', taxRate: '19' },
      { quantity: '3', unitPrice: '0.10', taxRate: '0' },
    ]);
    expect(totals.total).toBe('797.60');
    expect(totals.itemCount).toBe(2);
  });

  it('calcula descuento porcentual y fijo sin negativos', () => {
    const line = computeLine({
      quantity: '2',
      unitPrice: '100',
      discountPercent: '150',
      taxRate: '19',
    });
    expect(line.discount).toBe('200.00');
    expect(line.total).toBe('0.00');
  });
});
