import { describe, expect, it } from 'vitest';
import { computeLine, computeSaleTotals, formatMoney } from '@saldio/shared';

describe('presentación de importes', () => {
  it('formatea pesos colombianos sin decimales innecesarios', () => {
    expect(formatMoney('11900', 'COP')).toContain('11.900');
  });

  it('calcula una línea con IVA para vista previa', () => {
    const line = computeLine({ quantity: '2', unitPrice: '4500', taxRate: '19' });
    expect(line.total).toBe('10710.00');
  });

  it('suma varias líneas sin perder centavos', () => {
    const totals = computeSaleTotals([
      { quantity: '1', unitPrice: '0.10', taxRate: '0' },
      { quantity: '1', unitPrice: '0.20', taxRate: '0' },
    ]);
    expect(totals.total).toBe('0.30');
  });
});
