import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock, Plus, Printer, RefreshCw, Send, Split, Users, UtensilsCrossed, XCircle } from 'lucide-react';
import { computeLine, formatMoney } from '@saldio/shared';
import { api, newIdempotencyKey } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, StatusBadge } from '../../components/ui';
import { ReceiptPreview } from '../../components/receipt';
import type { ReceiptSnapshot } from '../../components/receipt.types';

type Dict = Record<string, any>;

export function RestaurantPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [openTable, setOpenTable] = useState<Dict | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [addItem, setAddItem] = useState({ productId: '', quantity: '1', notes: '' });
  const [splitIds, setSplitIds] = useState<string[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState([{ method: 'CASH', amount: '', received: '', tip: '' }]);
  const [tipAccepted, setTipAccepted] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [registerId, setRegisterId] = useState(localStorage.getItem('saldio.registerId') ?? '');
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [waste, setWaste] = useState(true);

  const areas = useQuery({ queryKey: ['restaurant-areas'], queryFn: () => api.get<Dict[]>('/tenant/restaurant/areas') });
  const orders = useQuery({ queryKey: ['restaurant-orders'], queryFn: () => api.get<Dict[]>('/tenant/restaurant/orders'), refetchInterval: 15000 });
  const order = useQuery({ queryKey: ['restaurant-order', orderId], queryFn: () => api.get<Dict>(`/tenant/restaurant/orders/${orderId}`), enabled: Boolean(orderId) });
  const products = useQuery({ queryKey: ['restaurant-products'], queryFn: () => api.get<{ items: Dict[] }>('/tenant/products?pageSize=100&active=true') });
  const customers = useQuery({ queryKey: ['restaurant-customers'], queryFn: () => api.get<Dict[]>('/tenant/customers') });
  const registers = useQuery({ queryKey: ['restaurant-registers'], queryFn: () => api.get<Dict[]>('/tenant/registers') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['restaurant-areas'] }); void qc.invalidateQueries({ queryKey: ['restaurant-orders'] }); if (orderId) void qc.invalidateQueries({ queryKey: ['restaurant-order', orderId] }); };

  const openOrder = useMutation({
    mutationFn: () => api.post<Dict>('/tenant/restaurant/orders', { branchId: openTable?.area.branchId ?? tenant.data!.branches[0]?.id, tableId: openTable?.id, type: 'DINE_IN', guestCount }),
    onSuccess: (data) => { toast.success(`Pedido ${data.number} abierto.`); setOrderId(data.id); setOpenTable(null); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const add = useMutation({
    mutationFn: () => api.post(`/tenant/restaurant/orders/${orderId}/items`, addItem),
    onSuccess: () => { setAddItem({ productId: '', quantity: '1', notes: '' }); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const send = useMutation({ mutationFn: () => api.post(`/tenant/restaurant/orders/${orderId}/send`), onSuccess: () => { toast.success('Comanda enviada a cocina.'); refresh(); }, onError: (error) => toast.error((error as Error).message) });
  const split = useMutation({
    mutationFn: () => api.post(`/tenant/restaurant/orders/${orderId}/split`, { itemIds: splitIds }),
    onSuccess: () => { toast.success('Cuenta separada sin duplicar líneas.'); setSplitIds([]); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const pay = useMutation({
    mutationFn: () => api.post<Dict>(`/tenant/restaurant/orders/${orderId}/pay`, {
      payments: payments.filter((p) => Number(p.amount) > 0).map((p, i) => ({ method: p.method, amount: p.amount, received: p.method === 'CASH' ? p.received || undefined : undefined, tip: i === 0 ? payments[0]!.tip || undefined : undefined })),
      tip: payments[0]?.tip || '0',
      tipAccepted,
      customerId: customerId || undefined,
      registerId: registerId || undefined,
    }, { headers: { 'Idempotency-Key': newIdempotencyKey() } }),
    onSuccess: (data) => { toast.success('Pedido cobrado.'); setPayOpen(false); setReceipt((data.sale as Dict).receipt as ReceiptSnapshot); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/tenant/restaurant/orders/${orderId}/cancel`, { reason: cancelReason, waste }),
    onSuccess: () => { toast.success('Pedido anulado y auditado.'); setCancelOpen(false); setOrderId(null); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const itemStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/tenant/restaurant/orders/${orderId}/items/${id}`, { status }),
    onSuccess: () => refresh(),
    onError: (error) => toast.error((error as Error).message),
  });

  const current = order.data;
  const activeOrders = (orders.data ?? []).filter((o) => !['PAID', 'CANCELLED'].includes(o.status));
  const total = current ? Number(current.total) : 0;
  const payTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <>
      <PageHeader title="Mesas y pedidos" description="Salón, comandas, cuentas separadas y cobro." actions={<button className="btn ghost" onClick={() => void areas.refetch()}><RefreshCw /> Actualizar</button>} />
      {areas.isLoading ? <Loading /> : areas.error ? <ErrorNotice error={areas.error} /> : (
        <>
          {(areas.data ?? []).length === 0 ? <Card><EmptyState title="Sin áreas configuradas" description="Cree un área y mesas desde la configuración o use el modo para llevar." icon={<UtensilsCrossed />} /></Card> : (areas.data ?? []).map((area) => (
            <Card key={area.id} title={area.name} subtitle={`${area.branch?.name ?? ''} · ${area.tables.length} mesas`} className="mb-3">
              <div className="table-map">{area.tables.map((table: Dict) => {
                const currentOrder = activeOrders.find((o) => o.tableId === table.id && !o.parentOrderId);
                return <button key={table.id} className={`table-card ${table.status === 'OCCUPIED' ? 'occupied' : 'free'}`} onClick={() => currentOrder ? setOrderId(currentOrder.id) : setOpenTable({ ...table, area })}><div className="tname">{table.name}</div><div className="tmeta"><Users size={12} /> {table.seats} puestos</div><div className="mt-1"><StatusBadge status={table.status} /></div>{currentOrder && <div className="small mt-1">{currentOrder.number} · {formatMoney(currentOrder.total)}</div>}</button>;
              })}</div>
            </Card>
          ))}
        </>
      )}
      <Card title="Pedidos abiertos">
        {orders.isLoading ? <Loading /> : activeOrders.length === 0 ? <EmptyState title="Sin pedidos abiertos" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Pedido</th><th>Mesa</th><th>Tipo</th><th>Estado</th><th className="num">Total</th><th className="num">Líneas</th><th /></tr></thead><tbody>{activeOrders.map((o) => <tr key={o.id}><td className="mono">{o.number}</td><td>{o.table?.name ?? 'Para llevar'}</td><td>{o.type === 'DINE_IN' ? 'Mesa' : 'Para llevar'}</td><td><StatusBadge status={o.status} /></td><td className="num">{formatMoney(o.total)}</td><td className="num">{o._count?.items ?? o.items?.length ?? 0}</td><td className="text-right"><button className="btn sm ghost" onClick={() => setOrderId(o.id)}>Abrir</button></td></tr>)}</tbody></table></div>}
      </Card>

      <Modal open={Boolean(openTable)} title={`Abrir ${openTable?.name ?? 'mesa'}`} onClose={() => setOpenTable(null)} footer={<><button className="btn ghost" onClick={() => setOpenTable(null)}>Cancelar</button><button className="btn primary" onClick={() => openOrder.mutate()} disabled={openOrder.isPending}>Abrir pedido</button></>}>
        <Field label="Comensales"><input className="input" type="number" min={1} max={50} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} /></Field>
      </Modal>

      <Modal open={Boolean(orderId)} title={current ? `Pedido ${current.number}` : 'Pedido'} onClose={() => { setOrderId(null); setSplitIds([]); }} wide footer={current && !['PAID', 'CANCELLED'].includes(current.status) ? <><button className="btn ghost" onClick={() => setCancelOpen(true)}><XCircle /> Anular</button><button className="btn ghost" onClick={() => send.mutate()} disabled={send.isPending}><Send /> Enviar a cocina</button><button className="btn ghost" disabled={!splitIds.length} onClick={() => split.mutate()}><Split /> Separar</button><button className="btn primary" onClick={() => { setPayments([{ method: 'CASH', amount: String(current.total), received: '', tip: '' }]); setPayOpen(true); }}>Cobrar {formatMoney(current.total)}</button></> : null}>
        {order.isLoading ? <Loading /> : order.error ? <ErrorNotice error={order.error} /> : current && (
          <div className="grid grid-2">
            <div>
              <div className="section-title"><h3>Líneas</h3><span className="badge neutral">{current.items.length}</span></div>
              <div className="list">{current.items.map((item: Dict) => <div className="list-row" key={item.id}><label className="checkbox" style={{ marginTop: 2 }}><input type="checkbox" checked={splitIds.includes(item.id)} disabled={item.status === 'CANCELLED'} onChange={(e) => setSplitIds(e.target.checked ? [...splitIds, item.id] : splitIds.filter((id) => id !== item.id))} /></label><div className="grow"><div className={item.status === 'CANCELLED' ? 'muted' : ''}>{item.name} × {Number(item.quantity).toFixed(item.quantity % 1 ? 3 : 0)}</div><div className="meta">{item.status} {item.notes ? `· ${item.notes}` : ''}</div></div><strong>{formatMoney(item.lineTotal)}</strong>{item.status !== 'CANCELLED' && <div className="flex gap-1"><button className="btn sm ghost" onClick={() => itemStatus.mutate({ id: item.id, status: 'PREPARING' })}>Prep.</button><button className="btn sm ghost" onClick={() => itemStatus.mutate({ id: item.id, status: 'READY' })}>Listo</button></div>}</div>)}</div>
              {!['PAID', 'CANCELLED'].includes(current.status) && <div className="card tight mt-2"><div className="section-title"><h3>Agregar producto</h3></div><div className="flex gap-1 wrap"><select className="select grow" value={addItem.productId} onChange={(e) => setAddItem({ ...addItem, productId: e.target.value })}><option value="">Producto</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price)}</option>)}</select><input className="input" style={{ width: 90 }} inputMode="decimal" value={addItem.quantity} onChange={(e) => setAddItem({ ...addItem, quantity: e.target.value })} /><button className="btn primary" disabled={!addItem.productId} onClick={() => add.mutate()}><Plus /></button></div><input className="input mt-1" placeholder="Observaciones (sin cebolla, término medio…)" value={addItem.notes} onChange={(e) => setAddItem({ ...addItem, notes: e.target.value })} /></div>}
            </div>
            <div>
              <Card className="tight" title="Cuenta">
                <div className="totals"><div className="row"><span>Subtotal</span><span>{formatMoney(current.subtotal)}</span></div><div className="row"><span>Impuestos</span><span>{formatMoney(current.tax)}</span></div><div className="row grand"><span>Total</span><span>{formatMoney(current.total)}</span></div></div>
                <div className="small muted mt-2">Mesa: {current.table?.name ?? 'Para llevar'} · {current.guestCount} comensales</div>
                <div className="small muted">Estado: {current.status}</div>
              </Card>
              <Card className="tight mt-2" title="Flujo">
                <ol className="small muted" style={{ paddingLeft: 18 }}><li>Agregue productos y observaciones.</li><li>Envíe la comanda: el inventario se descuenta una sola vez.</li><li>Separe líneas si el cliente pide cuentas distintas.</li><li>Cobre; la propina requiere aceptación.</li></ol>
              </Card>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={payOpen} title="Cobrar pedido" onClose={() => setPayOpen(false)} footer={<><button className="btn ghost" onClick={() => setPayOpen(false)}>Cancelar</button><button className="btn primary" disabled={pay.isPending || payTotal < total || !tipAccepted && Number(payments[0]?.tip) > 0} onClick={() => pay.mutate()}>Confirmar cobro</button></>}>
        <div className="form-grid">
          <Field label="Medio"><select className="select" value={payments[0]?.method} onChange={(e) => setPayments([{ ...payments[0]!, method: e.target.value }])}><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option></select></Field>
          <Field label="Importe"><input className="input" inputMode="decimal" value={payments[0]?.amount} onChange={(e) => setPayments([{ ...payments[0]!, amount: e.target.value }])} /></Field>
          {payments[0]?.method === 'CASH' && <Field label="Recibido"><input className="input" inputMode="decimal" value={payments[0]?.received} onChange={(e) => setPayments([{ ...payments[0]!, received: e.target.value }])} /></Field>}
          <Field label="Caja"><select className="select" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>{(registers.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Propina"><input className="input" inputMode="decimal" value={payments[0]?.tip} onChange={(e) => setPayments([{ ...payments[0]!, tip: e.target.value }])} /></Field>
          <label className="checkbox"><input type="checkbox" checked={tipAccepted} onChange={(e) => setTipAccepted(e.target.checked)} /> Cliente aceptó propina</label>
          <Field label="Cliente (si es a crédito)" className="full"><select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Consumidor final</option>{(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
        <div className="totals mt-2"><div className="row"><span>Total pedido</span><strong>{formatMoney(total)}</strong></div><div className="row"><span>Pagos</span><span>{formatMoney(payTotal)}</span></div>{Number(payments[0]?.tip) > 0 && <div className="row"><span>Propina</span><span>{formatMoney(payments[0]!.tip)}</span></div>}</div>
      </Modal>

      <Modal open={cancelOpen} title="Anular pedido" onClose={() => setCancelOpen(false)} footer={<><button className="btn ghost" onClick={() => setCancelOpen(false)}>Cancelar</button><button className="btn danger" disabled={cancelReason.length < 5} onClick={() => cancel.mutate()}>Anular pedido</button></>}>
        <Field label="Motivo"><textarea className="textarea" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
        <label className="checkbox mt-2"><input type="checkbox" checked={waste} onChange={(e) => setWaste(e.target.checked)} /> Registrar como desperdicio (no reingresar inventario)</label>
      </Modal>

      <Modal open={Boolean(receipt)} title="Comprobante del pedido" onClose={() => setReceipt(null)}>{receipt && <ReceiptPreview snapshot={receipt} width="80" onClose={() => setReceipt(null)} />}</Modal>
    </>
  );
}

export function KitchenPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['kitchen'], queryFn: () => api.get<Dict[]>('/tenant/restaurant/kitchen'), refetchInterval: 10000 });
  const update = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: string; itemId: string; status: string }) => api.patch(`/tenant/restaurant/orders/${orderId}/items/${itemId}`, { status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['kitchen'] }); void qc.invalidateQueries({ queryKey: ['restaurant-orders'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <>
      <PageHeader title="Cocina" description="Comandas pendientes, en preparación y listas. Se actualiza automáticamente." actions={<button className="btn ghost" onClick={() => void query.refetch()}><RefreshCw /> Actualizar</button>} />
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (query.data ?? []).length === 0 ? <Card><EmptyState title="Sin comandas activas" description="Los pedidos enviados desde mesas aparecerán aquí." icon={<ChefHat />} /></Card> : (
        <div className="grid grid-3">
          {(query.data ?? []).map((order) => <Card key={order.id} title={`${order.number} · ${order.table?.name ?? 'Para llevar'}`} subtitle={`${new Date(order.openedAt).toLocaleTimeString('es-CO')} · ${order.items.length} líneas`}>
            <div className="list">{order.items.map((item: Dict) => <div className="list-row" key={item.id}><div className="grow"><div className="strong">{item.name} × {item.quantity}</div>{item.notes && <div className="small warning-text">{item.notes}</div>}<div className="meta">{item.status}</div></div><div className="flex-col gap-1">{item.status === 'PENDING' && <button className="btn sm ghost" onClick={() => update.mutate({ orderId: order.id, itemId: item.id, status: 'PREPARING' })}>Preparar</button>}{item.status === 'PREPARING' && <button className="btn sm success" onClick={() => update.mutate({ orderId: order.id, itemId: item.id, status: 'READY' })}>Listo</button>}{item.status === 'READY' && <button className="btn sm ghost" onClick={() => update.mutate({ orderId: order.id, itemId: item.id, status: 'SERVED' })}>Servido</button>}</div></div>)}</div>
            <div className="mt-2"><StatusBadge status={order.status} /></div>
          </Card>)}
        </div>
      )}
    </>
  );
}
