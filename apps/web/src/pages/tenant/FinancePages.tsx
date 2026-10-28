import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, CreditCard, FileText, Plus, Send } from 'lucide-react';
import { computeLine, formatMoney } from '@saldio/shared';
import { api, newIdempotencyKey, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, Pagination, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

export function ReceivablesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState<Dict | null>(null);
  const [form, setForm] = useState({ amount: '', method: 'CASH', cashSessionId: '', reference: '' });
  const sessions = useQuery({ queryKey: ['receivable-cash'], queryFn: () => api.get<Dict[]>('/tenant/cash/sessions?status=OPEN') });
  const query = useQuery({ queryKey: ['receivables', page, status], queryFn: () => api.get<Dict>(`/tenant/receivables${queryString({ page, pageSize: 20, status })}`) });
  const pay = useMutation({
    mutationFn: () => api.post(`/tenant/receivables/${paying!.id}/payments`, { amount: form.amount, method: form.method, cashSessionId: form.cashSessionId || undefined, reference: form.reference || undefined }, { headers: { 'Idempotency-Key': newIdempotencyKey() } }),
    onSuccess: () => { toast.success('Abono registrado.'); setPaying(null); setForm({ amount: '', method: 'CASH', cashSessionId: '', reference: '' }); void qc.invalidateQueries({ queryKey: ['receivables'] }); void qc.invalidateQueries({ queryKey: ['tenant-dashboard'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <>
      <PageHeader title="Cartera" description="Cuentas por cobrar, abonos y saldos de ventas a crédito." />
      <div className="grid grid-3 mb-3">
        <div className="card stat"><div className="stat-label">Saldo pendiente</div><div className="stat-value"><Money value={query.data?.summary.balance ?? '0'} /></div></div>
        <div className="card stat"><div className="stat-label">Total original</div><div className="stat-value"><Money value={query.data?.summary.original ?? '0'} /></div></div>
        <div className="card stat"><div className="stat-label">Abonado</div><div className="stat-value"><Money value={query.data?.summary.paid ?? '0'} /></div></div>
      </div>
      <div className="toolbar"><select className="select" style={{ maxWidth: 190 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Todos</option><option value="OPEN">Abiertas</option><option value="PARTIAL">Parciales</option><option value="PAID">Pagadas</option></select></div>
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          {query.data!.items.length === 0 ? <EmptyState title="Sin cuentas por cobrar" icon={<CreditCard />} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Cliente</th><th>Venta</th><th>Vencimiento</th><th>Estado</th><th className="num">Original</th><th className="num">Abonado</th><th className="num">Saldo</th><th /></tr></thead><tbody>{query.data!.items.map((r: Dict) => <tr key={r.id}><td>{r.customer.name}<div className="tiny faint">{r.customer.phone}</div></td><td className="mono">{r.sale.number}</td><td className="small">{r.dueDate ? new Date(r.dueDate).toLocaleDateString('es-CO') : '—'}</td><td><StatusBadge status={r.status} /></td><td className="num">{formatMoney(r.originalAmount)}</td><td className="num">{formatMoney(r.paidAmount)}</td><td className="num strong">{formatMoney(r.balance)}</td><td className="text-right">{r.status !== 'PAID' && <button className="btn sm primary" onClick={() => { setPaying(r); setForm({ amount: r.balance, method: 'CASH', cashSessionId: sessions.data?.[0]?.id ?? '', reference: '' }); }}><Banknote /> Abonar</button>}</td></tr>)}</tbody></table></div>}
          <Pagination page={query.data!.meta.page} pages={query.data!.meta.pages} total={query.data!.meta.total} onChange={setPage} />
        </Card>
      )}
      <Modal open={Boolean(paying)} title={`Abono de ${paying?.customer.name ?? ''}`} onClose={() => setPaying(null)} footer={<><button className="btn ghost" onClick={() => setPaying(null)}>Cancelar</button><button className="btn primary" onClick={() => pay.mutate()} disabled={pay.isPending}>Registrar abono</button></>}>
        <div className="alert info mb-2"><CreditCard /><p>Saldo pendiente: <strong>{formatMoney(paying?.balance ?? 0)}</strong></p></div>
        <div className="form-grid">
          <Field label="Monto"><input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Medio"><select className="select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option></select></Field>
          {form.method === 'CASH' && <Field label="Caja abierta" className="full"><select className="select" value={form.cashSessionId} onChange={(e) => setForm({ ...form, cashSessionId: e.target.value })}><option value="">Seleccione</option>{(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.register?.name}</option>)}</select></Field>}
          <Field label="Referencia" className="full"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

export function QuotesPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customerId: '', validUntil: '', notes: '', items: [{ productId: '', quantity: '1' }] });
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['quotes', page], queryFn: () => api.get<Dict>(`/tenant/quotes${queryString({ page, pageSize: 20 })}`) });
  const products = useQuery({ queryKey: ['quote-products'], queryFn: () => api.get<{ items: Dict[] }>('/tenant/products?pageSize=100&active=true') });
  const customers = useQuery({ queryKey: ['quote-customers'], queryFn: () => api.get<Dict[]>('/tenant/customers') });
  const create = useMutation({
    mutationFn: () => api.post('/tenant/quotes', form),
    onSuccess: () => { toast.success('Cotización creada.'); setOpen(false); setForm({ customerId: '', validUntil: '', notes: '', items: [{ productId: '', quantity: '1' }] }); void qc.invalidateQueries({ queryKey: ['quotes'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const convert = useMutation({
    mutationFn: (id: string) => api.post(`/tenant/quotes/${id}/convert`),
    onSuccess: () => { toast.success('Cotización convertida en venta a crédito.'); void qc.invalidateQueries({ queryKey: ['quotes'] }); void qc.invalidateQueries({ queryKey: ['receivables'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const total = form.items.reduce((sum, item) => {
    const product = products.data?.items.find((p) => p.id === item.productId);
    if (!product) return sum;
    return sum + Number(computeLine({ quantity: item.quantity, unitPrice: product.price, taxRate: product.tax?.rate ?? 0 }).total);
  }, 0);
  return (
    <>
      <PageHeader title="Cotizaciones" description="Propuestas para ferretería y ventas por encargo; convertibles en ventas." actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus /> Nueva cotización</button>} />
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          {query.data!.items.length === 0 ? <EmptyState title="Sin cotizaciones" icon={<FileText />} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Número</th><th>Cliente</th><th>Validez</th><th>Estado</th><th className="num">Total</th><th /></tr></thead><tbody>{query.data!.items.map((q: Dict) => <tr key={q.id}><td className="mono">{q.number}</td><td>{q.customer?.name ?? 'Sin cliente'}</td><td className="small">{q.validUntil ? new Date(q.validUntil).toLocaleDateString('es-CO') : '—'}</td><td><StatusBadge status={q.status} /></td><td className="num">{formatMoney(q.total)}</td><td className="text-right">{q.status !== 'CONVERTED' && q.customerId && <button className="btn sm ghost" onClick={() => convert.mutate(q.id)}><CheckCircle2 /> Convertir</button>}</td></tr>)}</tbody></table></div>}
          <Pagination page={query.data!.meta.page} pages={query.data!.meta.pages} total={query.data!.meta.total} onChange={setPage} />
        </Card>
      )}
      <Modal open={open} title="Nueva cotización" onClose={() => setOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}>Crear cotización ({formatMoney(total)})</button></>}>
        <div className="form-grid">
          <Field label="Cliente"><select className="select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Sin cliente</option>{(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Válida hasta"><input className="input" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></Field>
        </div>
        <div className="section-title"><h3>Productos</h3><button className="btn sm ghost" onClick={() => setForm({ ...form, items: [...form.items, { productId: '', quantity: '1' }] })}><Plus /> Agregar</button></div>
        {form.items.map((item, index) => <div className="grid grid-2 mb-2" key={index}><Field label="Producto"><select className="select" value={item.productId} onChange={(e) => setForm({ ...form, items: form.items.map((it, i) => i === index ? { ...it, productId: e.target.value } : it) })}><option value="">Seleccione</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Cantidad"><input className="input" inputMode="decimal" value={item.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((it, i) => i === index ? { ...it, quantity: e.target.value } : it) })} /></Field></div>)}
        <Field label="Notas"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="alert info mt-2"><Send /><p>La conversión exige un cliente con cupo de crédito. No se envía una cotización al cliente desde este módulo.</p></div>
      </Modal>
    </>
  );
}

export function ExpensesPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ branchId: tenant.data!.branches[0]?.id ?? '', category: 'Operación', description: '', amount: '', paymentMethod: 'CASH', cashSessionId: '' });
  const sessions = useQuery({ queryKey: ['expense-cash'], queryFn: () => api.get<Dict[]>('/tenant/cash/sessions?status=OPEN') });
  const query = useQuery({ queryKey: ['expenses'], queryFn: () => api.get<Dict>('/tenant/expenses?page=1&pageSize=50') });
  const create = useMutation({
    mutationFn: () => api.post('/tenant/expenses', form),
    onSuccess: () => { toast.success('Gasto registrado.'); setOpen(false); void qc.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <>
      <PageHeader title="Gastos" description="Egresos operativos, categoría y efecto en caja." actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus /> Nuevo gasto</button>} />
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          <div className="flex justify-between mb-2"><span className="muted">Total listado</span><strong>{formatMoney(query.data!.total)}</strong></div>
          {query.data!.items.length === 0 ? <EmptyState title="Sin gastos registrados" icon={<Banknote />} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Medio</th><th className="num">Monto</th></tr></thead><tbody>{query.data!.items.map((e: Dict) => <tr key={e.id}><td className="small">{new Date(e.expenseDate).toLocaleDateString('es-CO')}</td><td><span className="badge neutral">{e.category}</span></td><td>{e.description}</td><td>{e.paymentMethod}</td><td className="num danger-text">-{formatMoney(e.amount)}</td></tr>)}</tbody></table></div>}
        </Card>
      )}
      <Modal open={open} title="Nuevo gasto" onClose={() => setOpen(false)} footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}>Registrar</button></>}>
        <div className="form-grid">
          <Field label="Sucursal"><select className="select" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>{tenant.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Categoría"><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Descripción" className="full"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Monto"><input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Medio"><select className="select" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option></select></Field>
          {form.paymentMethod === 'CASH' && <Field label="Caja abierta" className="full"><select className="select" value={form.cashSessionId} onChange={(e) => setForm({ ...form, cashSessionId: e.target.value })}><option value="">Seleccione</option>{(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.register?.name}</option>)}</select></Field>}
        </div>
      </Modal>
    </>
  );
}

function Money({ value }: { value: string | number }) {
  return <>{formatMoney(value)}</>;
}
