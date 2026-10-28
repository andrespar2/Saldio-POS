import { describe, expect, it } from 'vitest';
import {
  allocateMoney,
  computeLine,
  computeSaleTotals,
  resolveAccess,
  roundMoney,
} from './index.js';

describe('cálculos monetarios', () => {
  it('redondea mitad hacia arriba a dos decimales', () => {
    expect(roundMoney('1.005')).toBe('1.01');
    expect(roundMoney('2.675')).toBe('2.68');
    expect(roundMoney('0.004')).toBe('0.00');
  });

  it('calcula impuesto y descuento por línea', () => {
    const line = computeLine({
      quantity: '1.250',
      unitPrice: '8000',
      discountPercent: '10',
      taxRate: '19',
    });
    expect(line.gross).toBe('10000.00');
    expect(line.discount).toBe('1000.00');
    expect(line.tax).toBe('1710.00');
    expect(line.total).toBe('10710.00');
  });

  it('no permite descuentos mayores al bruto', () => {
    const line = computeLine({ quantity: 1, unitPrice: 100, discountAmount: 500 });
    expect(line.discount).toBe('100.00');
    expect(line.total).toBe('0.00');
  });

  it('suma líneas con cantidades fraccionarias', () => {
    const totals = computeSaleTotals([
      { quantity: '0.750', unitPrice: '12000', taxRate: '0' },
      { quantity: '2', unitPrice: '3500', taxRate: '19' },
    ]);
    expect(totals.total).toBe('17330.00');
    expect(totals.itemCount).toBe(2);
  });

  it('reparte sin perder centavos', () => {
    const parts = allocateMoney('100.00', [1, 1, 1]);
    expect(parts.reduce((a, b) => a + Number(b), 0)).toBe(100);
  });
});

describe('acceso efectivo', () => {
  const base = {
    storeStatus: 'ACTIVE' as const,
    businessType: 'SUPERMARKET' as const,
    contractedModules: ['CORE', 'POS', 'CASH', 'INVENTORY', 'REPORTS'],
    enabledModules: [],
    role: 'CASHIER' as const,
  };

  it('bloquea una tienda suspendida', () => {
    const result = resolveAccess({ ...base, storeStatus: 'SUSPENDED' });
    expect(result.allowed).toBe(false);
    expect(result.permissions).toEqual([]);
    expect(result.reason).toContain('suspendida');
  });

  it('intersece sector, plan y permisos', () => {
    const result = resolveAccess(base);
    expect(result.allowed).toBe(true);
    expect(result.effectiveModules).not.toContain('RESTAURANT');
    expect(result.permissions).toContain('sales.sell');
    expect(result.permissions).not.toContain('settings.manage');
  });
});
