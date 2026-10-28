import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, History, PackageCheck, Plus, Search, SlidersHorizontal, Truck } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, Pagination, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

export function InventoryPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjust, setAdjust] = useState({ productId: '', variantId: '', warehouseId: '', quantityDelta: '', reason: '', unitCost: '' });
  const [transfer, setTransfer] = useState({ productId: '', fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '', lotCode: '' });
  const canWrite = tenant.can('inventory.write');

  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Dict[]>('/tenant/warehouses') });
  const products = useQuery({ queryKey: ['inventory-products'], queryFn: () => api.get<{ items: Dict[] }>('/tenant/products?pageSize=100&active=true') });
  const stock = useQuery({
    queryKey: ['stock', search, warehouseId, lowStock, page],
    queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/tenant/inventory/stock${queryString({ search, warehouseId, lowStock: lowStock || undefined, page, pageSize: 40 })}`),
    enabled: tab === 'stock',
  });
  const movements = useQuery({
    queryKey: ['movements', page],
    queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/tenant/inventory/movements${queryString({ page, pageSize: 40 })}`),
    enabled: tab === 'movements',
  });
  const adjustMutation = useMutation({
    mutationFn: () => api.post('/tenant/inventory/adjustments', adjust),
    onSuccess: () => { toast.success('Ajuste registrado.'); setAdjustOpen(false); setAdjust({ productId: '', variantId: '', warehouseId: '', quantityDelta: '', reason: '', unitCost: '' }); void qc.invalidateQueries({ queryKey: ['stock'] }); void qc.invalidateQueries({ queryKey: ['movements'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const transferMutation = useMutation({
    mutationFn: () => api.post('/tenant/inventory/transfers', transfer),
    onSuccess: () => { toast.success('Transferencia registrada.'); setTransferOpen(false); setTransfer({ productId: '', fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '', lotCode: '' }); void qc.invalidateQueries({ queryKey: ['stock'] }); void qc.invalidateQueries({ queryKey: ['movements'] }); },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <>
      <PageHeader title="Inventario" description="Existencias por bodega, movimientos inmutables, ajustes y transferencias." actions={canWrite ? <><button className="btn ghost" onClick={() => { setAdjust({ ...adjust, warehouseId: warehouses.data?.[0]?.id ?? '' }); setAdjustOpen(true); }}><SlidersHorizontal /> Ajuste</button><button className="btn primary" onClick={() => { setTransfer({ ...transfer, fromWarehouseId: warehouses.data?.[0]?.id ?? '', toWarehouseId: warehouses.data?.[1]?.id ?? '' }); setTransferOpen(true); }}><ArrowLeftRight /> Transferir</button></> : undefined} />
      <div className="tabs"><button className={`tab ${tab === 'stock' ? 'active' : ''}`} onClick={() => { setTab('stock'); setPage(1); }}><Boxes /> Existencias</button><button className={`tab ${tab === 'movements' ? 'active' : ''}`} onClick={() => { setTab('movements'); setPage(1); }}><History /> Movimientos</button></div>
      {tab === 'stock' ? (
        <>
          <div className="toolbar">
            <div className="input-icon search"><Search /><input className="input" placeholder="Producto o SKU" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
            <select className="select" style={{ maxWidth: 230 }} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}><option value="">Todas las bodegas</option>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            <label className="checkbox"><input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setPage(1); }} /> Solo bajo mínimo</label>
          </div>
          {stock.isLoading ? <Loading /> : stock.error ? <ErrorNotice error={stock.error} /> : (
            <Card>
              {stock.data!.items.length === 0 ? <EmptyState title="Sin existencias" description="Registre compras o un stock inicial." icon={<Boxes />} /> : (
                <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th className="num">Cantidad</th><th className="num">Mínimo</th><th /></tr></thead><tbody>{stock.data!.items.map((row) => <tr key={row.id}><td><div className="strong">{row.product.name}</div><div className="tiny faint">{row.variant ? `${row.variant.sku} · ${row.variant.size ?? ''} ${row.variant.color ?? ''}` : row.product.sku}</div></td><td>{row.warehouse.name}</td><td className="small">{row.lotCode ?? '—'}{row.expiresAt ? <div className="tiny faint">Vence {new Date(row.expiresAt).toLocaleDateString('es-CO')}</div> : null}</td><td className="num strong">{Number(row.quantity).toLocaleString('es-CO', { maximumFractionDigits: 3 })}</td><td className="num">{row.product.reorderPoint ?? '—'}</td><td className="text-right">{canWrite && <button className="btn sm ghost" onClick={() => { setAdjust({ productId: row.product.id, variantId: row.variantId ?? '', warehouseId: row.warehouseId, quantityDelta: '', reason: '', unitCost: '' }); setAdjustOpen(true); }}>Ajustar</button>}</td></tr>)}</tbody></table></div>
              )}
              <Pagination page={stock.data!.meta.page} pages={stock.data!.meta.pages} total={stock.data!.meta.total} onChange={setPage} />
            </Card>
          )}
        </>
      ) : (
        <>
          {movements.isLoading ? <Loading /> : movements.error ? <ErrorNotice error={movements.error} /> : (
            <Card>
              {movements.data!.items.length === 0 ? <EmptyState title="Sin movimientos" /> : (
                <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Bodega</th><th className="num">Cantidad</th><th>Referencia</th></tr></thead><tbody>{movements.data!.items.map((m) => <tr key={m.id}><td className="small">{new Date(m.createdAt).toLocaleString('es-CO')}</td><td><span className={`badge ${Number(m.quantity) < 0 ? 'warning' : 'success'}`}>{m.type}</span></td><td>{m.product.name}<div className="tiny faint">{m.product.sku}</div></td><td>{m.warehouse.name}</td><td className={`num ${Number(m.quantity) < 0 ? 'danger-text' : 'success-text'}`}>{Number(m.quantity).toFixed(3)}</td><td className="small">{m.referenceType}{m.reason ? <div className="tiny faint">{m.reason}</div> : null}</td></tr>)}</tbody></table></div>
              )}
              <Pagination page={movements.data!.meta.page} pages={movements.data!.meta.pages} total={movements.data!.meta.total} onChange={setPage} />
            </Card>
          )}
        </>
      )}
      <Modal open={adjustOpen} title="Ajuste de inventario" onClose={() => setAdjustOpen(false)} footer={<><button className="btn ghost" onClick={() => setAdjustOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>Registrar ajuste</button></>}>
        <div className="flex-col gap-3">
          <Field label="Producto"><select className="select" value={adjust.productId} onChange={(e) => setAdjust({ ...adjust, productId: e.target.value })}><option value="">Seleccione</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></Field>
          <Field label="Bodega"><select className="select" value={adjust.warehouseId} onChange={(e) => setAdjust({ ...adjust, warehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <div className="form-grid">
            <Field label="Cantidad (+ entra / - sale)" hint="Use decimales si la unidad lo permite."><input className="input" inputMode="decimal" value={adjust.quantityDelta} onChange={(e) => setAdjust({ ...adjust, quantityDelta: e.target.value })} /></Field>
            <Field label="Costo unitario"><input className="input" inputMode="decimal" value={adjust.unitCost} onChange={(e) => setAdjust({ ...adjust, unitCost: e.target.value })} /></Field>
          </div>
          <Field label="Motivo (obligatorio)"><textarea className="textarea" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} /></Field>
          <div className="alert warning"><SlidersHorizontal /><p>El ajuste deja un movimiento inmutable con usuario, fecha y motivo.</p></div>
        </div>
      </Modal>
      <Modal open={transferOpen} title="Transferencia entre bodegas" onClose={() => setTransferOpen(false)} footer={<><button className="btn ghost" onClick={() => setTransferOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending}>Transferir</button></>}>
        <div className="flex-col gap-3">
          <Field label="Producto"><select className="select" value={transfer.productId} onChange={(e) => setTransfer({ ...transfer, productId: e.target.value })}><option value="">Seleccione</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></Field>
          <div className="form-grid">
            <Field label="Desde"><select className="select" value={transfer.fromWarehouseId} onChange={(e) => setTransfer({ ...transfer, fromWarehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Hacia"><select className="select" value={transfer.toWarehouseId} onChange={(e) => setTransfer({ ...transfer, toWarehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Cantidad"><input className="input" inputMode="decimal" value={transfer.quantity} onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })} /></Field>
            <Field label="Lote (opcional)"><input className="input" value={transfer.lotCode} onChange={(e) => setTransfer({ ...transfer, lotCode: e.target.value })} /></Field>
          </div>
          <Field label="Motivo"><textarea className="textarea" value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

const emptyPurchaseLine = { productId: '', quantity: '1', unitCost: '0' };

export function PurchasesPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Dict | null>(null);
  const [form, setForm] = useState({ supplierId: '', branchId: tenant.data!.branches[0]?.id ?? '', warehouseId: '', notes: '', lines: [{ ...emptyPurchaseLine }] });
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<Dict[]>('/tenant/suppliers') });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Dict[]>('/tenant/warehouses') });
  const products = useQuery({ queryKey: ['purchase-products'], queryFn: () => api.get<{ items: Dict[] }>('/tenant/products?pageSize=100&active=true') });
  const purchases = useQuery({ queryKey: ['purchases', page], queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/tenant/purchases${queryString({ page, pageSize: 20 })}`) });
  const create = useMutation({
    mutationFn: () => api.post('/tenant/purchases', form),
    onSuccess: () => { toast.success('Orden de compra creada.'); setOpen(false); setForm({ ...form, lines: [{ ...emptyPurchaseLine }], notes: '' }); void qc.invalidateQueries({ queryKey: ['purchases'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const receive = useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: Dict[] }) => api.post(`/tenant/purchases/${id}/receive`, { lines }),
    onSuccess: () => { toast.success('Recepción registrada y stock actualizado.'); setDetail(null); void qc.invalidateQueries({ queryKey: ['purchases'] }); void qc.invalidateQueries({ queryKey: ['stock'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  return (
    <>
      <PageHeader title="Compras" description="Órdenes, recepciones parciales y actualización trazable de existencias." actions={tenant.can('purchases.write') ? <button className="btn primary" onClick={() => { setForm({ ...form, warehouseId: warehouses.data?.[0]?.id ?? '' }); setOpen(true); }}><Plus /> Nueva compra</button> : undefined} />
      {purchases.isLoading ? <Loading /> : purchases.error ? <ErrorNotice error={purchases.error} /> : (
        <Card>
          {purchases.data!.items.length === 0 ? <EmptyState title="Sin compras" description="Registre una orden a proveedor." icon={<Truck />} /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Número</th><th>Proveedor</th><th>Bodega</th><th>Estado</th><th className="num">Total</th><th>Fecha</th><th /></tr></thead><tbody>{purchases.data!.items.map((purchase) => <tr key={purchase.id}><td className="mono">{purchase.number}</td><td>{purchase.supplier.name}</td><td>{purchase.warehouse?.name ?? '—'}</td><td><StatusBadge status={purchase.status} /></td><td className="num">{formatMoney(purchase.total)}</td><td className="small">{new Date(purchase.createdAt).toLocaleDateString('es-CO')}</td><td className="text-right"><button className="btn sm ghost" onClick={async () => { const data = await api.get<Dict>(`/tenant/purchases/${purchase.id}`); setDetail(data); setReceiveQty(Object.fromEntries(data.lines.map((l: Dict) => [l.id, String(Number(l.quantity) - Number(l.receivedQty))]))); }}>Abrir</button></td></tr>)}</tbody></table></div>
          )}
          <Pagination page={purchases.data!.meta.page} pages={purchases.data!.meta.pages} total={purchases.data!.meta.total} onChange={setPage} />
        </Card>
      )}

      <Modal open={open} title="Nueva orden de compra" onClose={() => setOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}>Crear orden</button></>}>
        <div className="form-grid">
          <Field label="Proveedor"><select className="select" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">Seleccione</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Bodega"><select className="select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        </div>
        <div className="section-title"><h3>Líneas</h3><button className="btn sm ghost" onClick={() => setForm({ ...form, lines: [...form.lines, { ...emptyPurchaseLine }] })}><Plus /> Agregar</button></div>
        {form.lines.map((line, index) => (
          <div className="grid grid-3 mb-2" key={index}>
            <Field label="Producto"><select className="select" value={line.productId} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, productId: e.target.value } : l) })}><option value="">Seleccione</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Cantidad"><input className="input" inputMode="decimal" value={line.quantity} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l) })} /></Field>
            <Field label="Costo unitario"><input className="input" inputMode="decimal" value={line.unitCost} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, unitCost: e.target.value } : l) })} /></Field>
          </div>
        ))}
        <Field label="Notas"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>

      <Modal open={Boolean(detail)} title={`Compra ${detail?.number ?? ''}`} onClose={() => setDetail(null)} wide footer={detail && ['ORDERED', 'PARTIAL'].includes(detail.status) ? <><button className="btn ghost" onClick={() => setDetail(null)}>Cerrar</button><button className="btn primary" onClick={() => receive.mutate({ id: detail.id, lines: detail.lines.filter((l: Dict) => Number(receiveQty[l.id] ?? 0) > 0).map((l: Dict) => ({ lineId: l.id, quantity: receiveQty[l.id] })) })}><PackageCheck /> Recibir</button></> : <button className="btn ghost" onClick={() => setDetail(null)}>Cerrar</button>}>
        {detail && <>
          <div className="flex justify-between mb-2"><StatusBadge status={detail.status} /><strong>{formatMoney(detail.total)}</strong></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th className="num">Pedido</th><th className="num">Recibido</th><th className="num">Pendiente</th><th>Recibir ahora</th></tr></thead><tbody>{detail.lines.map((line: Dict) => { const remaining = Number(line.quantity) - Number(line.receivedQty); return <tr key={line.id}><td>{line.description}</td><td className="num">{Number(line.quantity).toFixed(3)}</td><td className="num">{Number(line.receivedQty).toFixed(3)}</td><td className="num">{remaining.toFixed(3)}</td><td>{['ORDERED', 'PARTIAL'].includes(detail.status) && <input className="input" style={{ width: 110 }} inputMode="decimal" value={receiveQty[line.id] ?? ''} onChange={(e) => setReceiveQty({ ...receiveQty, [line.id]: e.target.value })} />}</td></tr>; })}</tbody></table></div>
        </>}
      </Modal>
    </>
  );
}
