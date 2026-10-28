import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const MONEY_SCALE = 2;
export const QUANTITY_SCALE = 3;

export function dec(value: Decimal.Value): Decimal {
  return new Decimal(value ?? 0);
}

/** Redondeo monetario documentado: mitad hacia arriba, 2 decimales. */
export function roundMoney(value: Decimal.Value): string {
  return dec(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toFixed(MONEY_SCALE);
}

export function roundQuantity(value: Decimal.Value): string {
  return dec(value)
    .toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(QUANTITY_SCALE);
}

export interface LineInput {
  quantity: string | number;
  unitPrice: string | number;
  discountPercent?: string | number;
  discountAmount?: string | number;
  taxRate?: string | number;
}

export interface LineTotals {
  quantity: string;
  unitPrice: string;
  gross: string;
  discount: string;
  taxableBase: string;
  tax: string;
  total: string;
}

/**
 * Regla unica de calculo por linea. El servidor la usa como fuente de verdad
 * y la web solo para vista previa.
 */
export function computeLine(input: LineInput): LineTotals {
  const quantity = dec(input.quantity);
  const unitPrice = dec(input.unitPrice);
  const gross = quantity.times(unitPrice);
  const percent = dec(input.discountPercent ?? 0);
  const fixed = dec(input.discountAmount ?? 0);
  const rawDiscount = gross.times(percent).dividedBy(100).plus(fixed);
  const discount = Decimal.min(Decimal.max(rawDiscount, 0), gross);
  const taxableBase = gross.minus(discount);
  const tax = taxableBase.times(dec(input.taxRate ?? 0)).dividedBy(100);
  return {
    quantity: roundQuantity(quantity),
    unitPrice: roundMoney(unitPrice),
    gross: roundMoney(gross),
    discount: roundMoney(discount),
    taxableBase: roundMoney(taxableBase),
    tax: roundMoney(tax),
    total: roundMoney(taxableBase.plus(tax)),
  };
}

export interface SaleTotals {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  itemCount: number;
}

export function computeSaleTotals(lines: LineInput[]): SaleTotals {
  let subtotal = dec(0);
  let discount = dec(0);
  let tax = dec(0);
  let total = dec(0);
  let itemCount = 0;
  for (const line of lines) {
    const computed = computeLine(line);
    subtotal = subtotal.plus(computed.gross);
    discount = discount.plus(computed.discount);
    tax = tax.plus(computed.tax);
    total = total.plus(computed.total);
    itemCount += 1;
  }
  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    tax: roundMoney(tax),
    total: roundMoney(total),
    itemCount,
  };
}

export function sumMoney(values: Array<string | number>): string {
  return roundMoney(values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), dec(0)));
}

export function changeDue(received: string | number, total: string | number): string {
  return roundMoney(Decimal.max(dec(received).minus(dec(total)), 0));
}

export function remainingBalance(total: string | number, paid: string | number): string {
  return roundMoney(Decimal.max(dec(total).minus(dec(paid)), 0));
}

export function formatMoney(
  value: string | number,
  currency = 'COP',
  locale = 'es-CO',
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'COP' ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatQuantity(value: string | number, allowDecimal = true): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return allowDecimal
    ? amount.toLocaleString('es-CO', { maximumFractionDigits: 3 })
    : Math.trunc(amount).toLocaleString('es-CO');
}

/** Reparte un total con redondeo sin perder ni inventar centavos. */
export function allocateMoney(
  total: string | number,
  weights: Array<string | number>,
): string[] {
  const totalCents = dec(total).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const sumWeights = weights.reduce<Decimal>((acc, w) => acc.plus(dec(w)), dec(0));
  if (sumWeights.isZero()) {
    return weights.map((_, i) => (i === 0 ? roundMoney(totalCents) : roundMoney(0)));
  }
  let assigned = dec(0);
  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return roundMoney(totalCents.minus(assigned).dividedBy(100));
    }
    const cents = totalCents
      .times(dec(weight))
      .dividedBy(sumWeights)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    assigned = assigned.plus(cents);
    return roundMoney(cents.dividedBy(100));
  });
}
