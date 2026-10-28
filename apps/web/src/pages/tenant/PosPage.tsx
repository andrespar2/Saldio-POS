import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Barcode,
  Calculator,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';
import { computeLine, computeSaleTotals, formatMoney } from '@saldio/shared';
import { api, newIdempotencyKey, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal } from '../../components/ui';
import { ReceiptPreview, printReceipt } from '../../components/receipt';
import type { ReceiptSnapshot } from '../../components/receipt.types';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  tax: { rate: string } | null;
  unit: { allowDecimal: boolean; code: string };
  totalStock: string;
  variants: Array<{ id: string; sku: string; size: string | null; color: string | null; barcode: string | null; priceOverride: string | null }>;
}
interface CartLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  unitPrice: string;
  taxRate: string;
  quantity: string;
  discountPercent: string;
  allowDecimal: boolean;
  stock: string;
}
interface PaymentRow {
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
  amount: string;
  received: string;
}
interface Customer { id: string; name: string; creditLimit: string; }

const METHODS = [
  { code: 'CASH', label: 'Efectivo' },
  { code: 'CARD', label: 'Tarjeta' },
  { code: 'TRANSFER', label: 'Transferencia' },
  { code: 'OTHER', label: 'Otro' },
] as const;

export function PosPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const access = tenant.data!;
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [registerId, setRegisterId] = useState(localStorage.getItem('saldio.registerId') ?? '');
  const [branchId, setBranchId] = useState(localStorage.getItem('saldio.branchId') ?? access.branches[0]?.id ?? '');
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'CASH', amount: '0', received: '' }]);
  const [amountTouched, setAmountTouched] = useState(false);
  const [credit, setCredit] = useState(false);
  const [tip, setTip] = useState('0');
  const [tipAccepted, setTipAccepted] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<'58' | '80' | 'a4'>('80');
  const [error, setError] = useState<unknown>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canDiscount = tenant.can('sales.discount');

  const productsQuery = useQuery({
    queryKey: ['pos-products', search, branchId],
    queryFn: () => api.get<{ items: Product[] }>(`/tenant/products${queryString({ search, pageSize: 48, active: true })}`),
    enabled: Boolean(branchId),
  });
  const customersQuery = useQuery({ queryKey: ['pos-customers'], queryFn: () => api.get<Customer[]>('/tenant/customers') });
  const registersQuery = useQuery({ queryKey: ['pos-registers'], queryFn: () => api.get<Array<{ id: string; name: string; branchId: string }>>('/tenant/registers') });
  const cashQuery = useQuery({
    queryKey: ['pos-cash', registerId],
    queryFn: () => api.get<{ id: string; openingAmount: string } | null>(`/tenant/cash/current${queryString({ registerId })}`),
    enabled: Boolean(registerId),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!registerId && registersQuery.data?.length) {
      const first = registersQuery.data[0]!;
      setRegisterId(first.id);
      setBranchId(first.branchId);
    }
  }, [registersQuery.data, registerId]);
  useEffect(() => {
    if (registerId) localStorage.setItem('saldio.registerId', registerId);
    if (branchId) localStorage.setItem('saldio.branchId', branchId);
  }, [registerId, branchId]);

  const totals = useMemo(() => computeSaleTotals(cart.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxRate: line.taxRate,
  }))), [cart]);
  const due = Number(totals.total) + (tipAccepted ? Number(tip || 0) : 0);

  useEffect(() => {
    if (!amountTouched) {
      setPayments((current) => current.length === 1 ? [{ ...current[0]!, amount: totals.total }] : current);
    }
  }, [totals.total, amountTouched]);

  const addProduct = (product: Product, variant?: Product['variants'][number]) => {
    const key = `${product.id}:${variant?.id ?? ''}`;
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) => line.key === key ? { ...line, quantity: (Number(line.quantity) + 1).toFixed(line.allowDecimal ? 3 : 0) } : line);
      }
      return [...current, {
        key,
        productId: product.id,
        variantId: variant?.id,
        name: `${product.name}${variant ? ` · ${[variant.size, variant.color].filter(Boolean).join(' / ')}` : ''}`,
        sku: variant?.sku ?? product.sku,
        unitPrice: variant?.priceOverride ?? product.price,
        taxRate: product.tax?.rate ?? '0',
        quantity: product.unit.allowDecimal ? '1.000' : '1',
        discountPercent: '0',
        allowDecimal: product.unit.allowDecimal,
        stock: product.totalStock,
      }];
    });
    setVariantProduct(null);
    setSearch('');
  };

  const scan = async (code: string) => {
    if (!code.trim()) return;
    try {
      const data = await api.get<{ product: Product; variant: Product['variants'][number] | null }>(`/tenant/products/barcode/${encodeURIComponent(code.trim())}`);
      addProduct(data.product, data.variant ?? undefined);
      setBarcode('');
    } catch (caught) {
      toast.error((caught as Error).message);
    }
  };

  const updateLine = (key: string, patch: Partial<CartLine>) => setCart((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const removeLine = (key: string) => setCart((current) => current.filter((line) => line.key !== key));
  const changeQty = (line: CartLine, delta: number) => {
    const next = Number(line.quantity) + delta;
    if (next <= 0) return removeLine(line.key);
    updateLine(line.key, { quantity: line.allowDecimal ? next.toFixed(3) : String(Math.floor(next)) });
  };

  const openCash = useMutation({
    mutationFn: () => api.post('/tenant/cash/open', { registerId, openingAmount }),
    onSuccess: () => { toast.success('Caja abierta.'); setCashOpen(false); void qc.invalidateQueries({ queryKey: ['pos-cash'] }); },
    onError: (err) => setError(err),
  });

  const submitSale = useMutation({
    mutationFn: async () => {
      if (!registerId && payments.some((p) => p.method === 'CASH')) throw new Error('Seleccione una caja.');
      if (payments.some((p) => p.method === 'CASH') && !cashQuery.data) { setCashOpen(true); throw new Error('Debe abrir la caja antes de cobrar en efectivo.'); }
      const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      if (!credit && Math.abs(paid - due) > 0.009) throw new Error('Los pagos deben sumar exactamente el total.');
      if (credit && !customerId) throw new Error('Seleccione un cliente para la venta a crédito.');
      const key = newIdempotencyKey();
      return api.post<Record<string, any>>('/tenant/sales', {
        branchId,
        registerId: registerId || undefined,
        customerId: customerId || undefined,
        type: credit ? 'CREDIT' : 'SALE',
        items: cart.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          discountPercent: canDiscount ? line.discountPercent : '0',
        })),
        payments: payments.filter((payment) => Number(payment.amount) > 0).map((payment, index) => ({
          method: payment.method,
          amount: payment.amount,
          received: payment.method === 'CASH' && payment.received ? payment.received : undefined,
          tip: index === 0 && tipAccepted ? tip : undefined,
        })),
        tip: tipAccepted ? tip : '0',
        tipAccepted,
      }, { headers: { 'Idempotency-Key': key } });
    },
    onSuccess: (sale) => {
      setReceipt(sale.receipt as ReceiptSnapshot);
      setPaymentOpen(false);
      setCart([]);
      setPayments([{ method: 'CASH', amount: '0', received: '' }]);
      setAmountTouched(false);
      setTip('0');
      setTipAccepted(false);
      setCustomerId('');
      setCredit(false);
      void qc.invalidateQueries({ queryKey: ['pos-products'] });
      void qc.invalidateQueries({ queryKey: ['pos-cash'] });
      void qc.invalidateQueries({ queryKey: ['tenant-dashboard'] });
      toast.success(`Venta ${sale.number} confirmada.`);
    },
    onError: (err) => setError(err),
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'F9') { event.preventDefault(); if (cart.length) setPaymentOpen(true); }
      if (event.key === 'F4') { event.preventDefault(); if (!cashQuery.data) setCashOpen(true); }
      if (event.key === 'Escape') { setPaymentOpen(false); setVariantProduct(null); setCashOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart.length, cashQuery.data]);

  const paymentSummary = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const change = payments.reduce((sum, p) => p.method === 'CASH' ? sum + Math.max(0, Number(p.received || 0) - Number(p.amount || 0)) : sum, 0);

  return (
    <>
      <div className="page-head no-print">
        <div className="grow">
          <h1>Punto de venta</h1>
          <p>{access.store.name} · Atajos: F2 buscar, F4 caja, F9 cobrar.</p>
        </div>
        <div className="page-actions">
          <select className="select" style={{ minWidth: 190 }} value={registerId} onChange={(e) => { const reg = registersQuery.data?.find((r) => r.id === e.target.value); setRegisterId(e.target.value); if (reg) setBranchId(reg.branchId); }}>
            {(registersQuery.data ?? []).map((reg) => <option key={reg.id} value={reg.id}>{reg.name}</option>)}
          </select>
          {cashQuery.data ? <span className="badge success"><Wallet size={12} /> Caja abierta</span> : <button className="btn ghost" onClick={() => setCashOpen(true)}><Wallet /> Abrir caja</button>}
        </div>
      </div>
      <div className="pos-grid">
        <section className="flex-col gap-2">
          <div className="card tight">
            <div className="flex gap-2 wrap">
              <div className="input-icon grow"><Search /><input ref={searchRef} className="input" placeholder="Buscar producto por nombre, SKU… (F2)" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="input-icon" style={{ flex: '0 1 280px' }}><Barcode /><input className="input" placeholder="Escanear código y Enter" value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void scan(barcode); }} /></div>
            </div>
          </div>
          {productsQuery.isLoading ? <Loading /> : productsQuery.error ? <ErrorNotice error={productsQuery.error} /> : (
            <div className="pos-products">
              {productsQuery.data!.items.length === 0 && <EmptyState title="Sin productos" description="Cree productos desde el catálogo o ajuste la búsqueda." />}
              {productsQuery.data!.items.map((product) => (
                <button key={product.id} className="pos-tile" onClick={() => product.variants.length ? setVariantProduct(product) : addProduct(product)}>
                  <div className="name">{product.name}</div>
                  <div className="price">{formatMoney(product.price)}</div>
                  <div className="stock">{product.sku} · stock {product.totalStock}{product.variants.length ? ` · ${product.variants.length} variantes` : ''}</div>
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="cart card no-print">
          <div className="card-head" style={{ marginBottom: 4 }}>
            <h2><ShoppingCart size={17} /> Venta actual</h2>
            <span className="badge neutral">{cart.length} línea(s)</span>
          </div>
          <div className="cart-lines">
            {cart.length === 0 ? <EmptyState title="Carrito vacío" description="Escanee o toque un producto." icon={<ScanLine />} /> : cart.map((line) => (
              <div className="cart-line" key={line.key}>
                <div>
                  <div className="strong small">{line.name}</div>
                  <div className="tiny faint">{line.sku} · {formatMoney(line.unitPrice)}</div>
                  {canDiscount && <div className="flex items-center gap-1 mt-1"><span className="tiny faint">Desc. %</span><input className="input" style={{ width: 58, minHeight: 25, padding: '2px 6px' }} value={line.discountPercent} onChange={(e) => updateLine(line.key, { discountPercent: e.target.value })} /></div>}
                </div>
                <div className="text-right">
                  <div className="strong">{formatMoney(computeLine({ quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, taxRate: line.taxRate }).total)}</div>
                  <div className="qty mt-1">
                    <button onClick={() => changeQty(line, -1)} aria-label="Restar"><Minus size={12} /></button>
                    <input value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} inputMode="decimal" />
                    <button onClick={() => changeQty(line, 1)} aria-label="Sumar"><Plus size={12} /></button>
                  </div>
                  <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => removeLine(line.key)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="totals">
            <div className="row"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
            <div className="row"><span>Descuentos</span><span>-{formatMoney(totals.discount)}</span></div>
            <div className="row"><span>Impuestos</span><span>{formatMoney(totals.tax)}</span></div>
            <div className="row grand"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
          </div>
          <div className="flex-col gap-1 mt-2">
            <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Consumidor final</option>
              {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
            {tenant.hasModule('CREDITS') && <label className="checkbox"><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> Venta a crédito</label>}
          </div>
          <button className="btn primary lg touch block mt-2" disabled={!cart.length} onClick={() => { setError(null); setPaymentOpen(true); }}><Calculator /> Cobrar {formatMoney(totals.total)} <span className="tiny faint">(F9)</span></button>
          <div className="tiny faint mt-1">Los cálculos se confirman en el servidor. La venta requiere conexión.</div>
        </aside>
      </div>

      <Modal open={Boolean(variantProduct)} title={`Variantes de ${variantProduct?.name ?? ''}`} onClose={() => setVariantProduct(null)}>
        <div className="list">{variantProduct?.variants.map((variant) => <button key={variant.id} className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => addProduct(variantProduct, variant)}><span>{[variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku}<span className="tiny faint"> · {variant.sku}</span></span><span>{formatMoney(variant.priceOverride ?? variantProduct.price)}</span></button>)}</div>
      </Modal>

      <Modal open={paymentOpen} title="Cobrar venta" onClose={() => setPaymentOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setPaymentOpen(false)}>Cancelar</button><button className="btn primary lg" disabled={submitSale.isPending} onClick={() => { setError(null); submitSale.mutate(); }}>{submitSale.isPending ? 'Confirmando…' : `Confirmar ${formatMoney(due)}`}</button></>}>
        <div className="grid grid-2">
          <div>
            <div className="section-title"><h3>Medios de pago</h3><button className="btn sm ghost" onClick={() => setPayments([...payments, { method: 'CARD', amount: '0', received: '' }])}><Plus /> Mixto</button></div>
            {payments.map((payment, index) => (
              <div className="card tight mb-2" key={index}>
                <div className="flex gap-1 wrap mb-2">
                  {METHODS.map((method) => <button key={method.code} className={`pay-method ${payment.method === method.code ? 'active' : ''}`} onClick={() => setPayments(payments.map((p, i) => i === index ? { ...p, method: method.code } : p))}>{method.label}</button>)}
                </div>
                <div className="form-grid">
                  <Field label="Importe"><input className="input" inputMode="decimal" value={payment.amount} onChange={(e) => { setAmountTouched(true); setPayments(payments.map((p, i) => i === index ? { ...p, amount: e.target.value } : p)); }} /></Field>
                  {payment.method === 'CASH' && <Field label="Efectivo recibido"><input className="input" inputMode="decimal" value={payment.received} onChange={(e) => setPayments(payments.map((p, i) => i === index ? { ...p, received: e.target.value } : p))} /></Field>}
                </div>
                {payment.method === 'CASH' && Number(payment.received) > Number(payment.amount) && <div className="small success-text mt-1">Cambio: {formatMoney(Number(payment.received) - Number(payment.amount))}</div>}
                {payments.length > 1 && <button className="btn sm danger mt-2" onClick={() => setPayments(payments.filter((_, i) => i !== index))}><Trash2 /> Quitar</button>}
              </div>
            ))}
            <div className="totals">
              <div className="row"><span>Total a pagar</span><strong>{formatMoney(due)}</strong></div>
              <div className="row"><span>Pagos ingresados</span><span>{formatMoney(paymentSummary)}</span></div>
              {credit && <div className="row warning-text"><span>Saldo a crédito</span><span>{formatMoney(Math.max(0, due - paymentSummary))}</span></div>}
              {change > 0 && <div className="row success-text"><span>Cambio</span><span>{formatMoney(change)}</span></div>}
            </div>
          </div>
          <div>
            <div className="section-title"><h3>Propina (opcional)</h3></div>
            <div className="form-grid">
              <Field label="Propina"><input className="input" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} /></Field>
              <label className="checkbox" style={{ marginTop: 24 }}><input type="checkbox" checked={tipAccepted} onChange={(e) => setTipAccepted(e.target.checked)} /> El cliente aceptó la propina</label>
            </div>
            <div className="alert info mt-3"><CreditCard /><p>La propina nunca se suma sin aceptación. Puede registrar pagos mixtos; el servidor valida la suma.</p></div>
            {!cashQuery.data && payments.some((p) => p.method === 'CASH') && <div className="alert warning mt-2"><Wallet /><p>No hay caja abierta para este registro.</p><button className="btn sm ghost mt-1" onClick={() => setCashOpen(true)}>Abrir caja</button></div>}
            <ErrorNotice error={error} />
          </div>
        </div>
      </Modal>

      <Modal open={cashOpen} title="Abrir caja" onClose={() => setCashOpen(false)} footer={<><button className="btn ghost" onClick={() => setCashOpen(false)}>Cancelar</button><button className="btn primary" disabled={openCash.isPending} onClick={() => openCash.mutate()}>Abrir</button></>}>
        <Field label="Fondo inicial en efectivo" hint="Se registra como movimiento de apertura."><input className="input" inputMode="decimal" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} /></Field>
        <ErrorNotice error={error} />
      </Modal>

      <Modal open={Boolean(receipt)} title="Venta confirmada" onClose={() => setReceipt(null)} wide>
        {receipt && <ReceiptPreview snapshot={receipt} width={receiptWidth} onClose={() => setReceipt(null)} />}
        <div className="flex gap-2 mt-2 no-print">
          {(['58', '80', 'a4'] as const).map((width) => <button key={width} className={`choice ${receiptWidth === width ? 'active' : ''}`} onClick={() => setReceiptWidth(width)}>{width === 'a4' ? 'A4' : `${width} mm`}</button>)}
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => receipt && printReceipt(receipt, receiptWidth)}><Printer /> Imprimir</button>
        </div>
      </Modal>
    </>
  );
}
