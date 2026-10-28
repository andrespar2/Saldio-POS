import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Printer, RotateCcw, Search } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, download, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, Pagination, StatusBadge } from '../../components/ui';
import { ReceiptPreview, printReceipt } from '../../components/receipt';
import type { ReceiptSnapshot } from '../../components/receipt.types';

type Dict = Record<string, any>;

export function SalesPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<'58' | '80' | 'a4'>('80');
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({ reason: '', refundMethod: 'CASH', waste: false, quantities: {} as Record<string, string> });
  const canRefund = tenant.can('sales.refund');

  const query = useQuery({
    queryKey: ['sales', search, status, from, to, page],
    queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/tenant/sales${queryString({ search, status, from, to, page, pageSize: 25 })}`),
  });
  const detail = useQuery({
    queryKey: ['sale', detailId],
    queryFn: () => api.get<Dict>(`/tenant/sales/${detailId}`),
    enabled: Boolean(detailId),
  });
  const openReceipt = async (id: string) => {
    try {
      const snapshot = await api.get<ReceiptSnapshot>(`/tenant/sales/${id}/receipt`);
      setReceipt(snapshot);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const print = async (id: string) => {
    try {
      const snapshot = await api.post<ReceiptSnapshot>(`/tenant/sales/${id}/print`);
      printReceipt(snapshot, receiptWidth);
      toast.success(snapshot.copy ? 'Reimpresión marcada como copia.' : 'Comprobante enviado a impresión.');
      void qc.invalidateQueries({ queryKey: ['sale', id] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const createReturn = useMutation({
    mutationFn: () => api.post(`/tenant/sales/${detailId}/returns`, {
      type: 'PARTIAL',
      reason: returnForm.reason,
      refundMethod: returnForm.refundMethod,
      waste: returnForm.waste,
      lines: Object.entries(returnForm.quantities).filter(([, qty]) => Number(qty) > 0).map(([saleLineId, quantity]) => ({ saleLineId, quantity, restock: !returnForm.waste })),
    }),
    onSuccess: () => { toast.success('Devolución registrada.'); setReturnOpen(false); setReturnForm({ reason: '', refundMethod: 'CASH', waste: false, quantities: {} }); void qc.invalidateQueries({ queryKey: ['sales'] }); void qc.invalidateQueries({ queryKey: ['sale', detailId] }); void qc.invalidateQueries({ queryKey: ['tenant-dashboard'] }); },
    onError: (error) => toast.error((error as Error).message),
  });

  const sale = detail.data;
  const alreadyReturned = (lineId: string) => (sale?.returns ?? []).flatMap((r: Dict) => r.lines).filter((l: Dict) => l.saleLineId === lineId).reduce((sum: number, l: Dict) => sum + Number(l.quantity), 0);

  return (
    <>
      <PageHeader title="Ventas y comprobantes" description="Consulte operaciones confirmadas, reimprima copias y registre devoluciones." actions={<button className="btn ghost" onClick={() => download(`/tenant/reports/sales.csv${queryString({ from, to })}`, 'ventas.csv')}><Download /> Exportar CSV</button>} />
      <div className="toolbar">
        <div className="input-icon search"><Search /><input className="input" placeholder="Número o cliente" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="select" style={{ maxWidth: 190 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Todos los estados</option><option value="CONFIRMED">Confirmadas</option><option value="PARTIALLY_REFUNDED">Devueltas parcial</option><option value="REFUNDED">Devueltas</option></select>
        <input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ maxWidth: 170 }} />
        <input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ maxWidth: 170 }} />
      </div>
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          {query.data!.items.length === 0 ? <EmptyState title="Sin ventas" description="Las ventas confirmadas aparecerán aquí." /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Sucursal</th><th>Tipo</th><th>Estado</th><th className="num">Total</th><th className="num">Saldo</th><th /></tr></thead><tbody>{query.data!.items.map((sale) => <tr key={sale.id}><td className="mono">{sale.number}</td><td className="small">{new Date(sale.createdAt).toLocaleString('es-CO')}</td><td>{sale.customer?.name ?? 'Consumidor final'}</td><td>{sale.branch?.name}</td><td><span className="badge neutral">{sale.type}</span></td><td><StatusBadge status={sale.status} /></td><td className="num">{formatMoney(sale.total)}</td><td className="num">{formatMoney(sale.balance)}</td><td className="text-right"><button className="btn sm ghost" onClick={() => setDetailId(sale.id)}><Eye /></button><button className="btn sm ghost" onClick={() => openReceipt(sale.id)}><FileText /></button><button className="btn sm ghost" onClick={() => print(sale.id)}><Printer /></button></td></tr>)}</tbody></table></div>
          )}
          <Pagination page={query.data!.meta.page} pages={query.data!.meta.pages} total={query.data!.meta.total} onChange={setPage} />
        </Card>
      )}

      <Modal open={Boolean(detailId)} title={sale ? `Venta ${sale.number}` : 'Venta'} onClose={() => setDetailId(null)} wide footer={sale ? <><button className="btn ghost" onClick={() => setDetailId(null)}>Cerrar</button><button className="btn ghost" onClick={() => openReceipt(sale.id)}><FileText /> Vista previa</button><button className="btn ghost" onClick={() => download(`/tenant/sales/${sale.id}/pdf?width=${receiptWidth}`, `comprobante-${sale.number}.pdf`)}><Download /> PDF</button><button className="btn ghost" onClick={() => print(sale.id)}><Printer /> Imprimir</button>{canRefund && sale.status !== 'REFUNDED' && <button className="btn danger" onClick={() => { setReturnForm({ reason: '', refundMethod: 'CASH', waste: false, quantities: {} }); setReturnOpen(true); }}><RotateCcw /> Devolución</button>}</> : null}>
        {detail.isLoading ? <Loading /> : detail.error ? <ErrorNotice error={detail.error} /> : sale && (
          <>
            <div className="grid grid-2">
              <Card className="tight" title="Datos">
                <dl className="kv"><dt>Estado</dt><dd><StatusBadge status={sale.status} /></dd><dt>Fecha</dt><dd>{new Date(sale.createdAt).toLocaleString('es-CO')}</dd><dt>Cliente</dt><dd>{sale.customer?.name ?? 'Consumidor final'}</dd><dt>Sucursal / caja</dt><dd>{sale.branch?.name} / {sale.register?.name ?? '—'}</dd><dt>Vendedor</dt><dd>{sale.soldById ?? '—'}</dd></dl>
              </Card>
              <Card className="tight" title="Totales">
                <div className="totals"><div className="row"><span>Subtotal</span><span>{formatMoney(sale.subtotal)}</span></div><div className="row"><span>Descuento</span><span>-{formatMoney(sale.discount)}</span></div><div className="row"><span>Impuestos</span><span>{formatMoney(sale.tax)}</span></div><div className="row grand"><span>Total</span><span>{formatMoney(sale.total)}</span></div><div className="row"><span>Pagado</span><span>{formatMoney(sale.paid)}</span></div><div className="row"><span>Saldo</span><span>{formatMoney(sale.balance)}</span></div></div>
              </Card>
            </div>
            <div className="section-title"><h3>Líneas</h3></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Desc.</th><th className="num">Total</th></tr></thead><tbody>{sale.lines.map((line: Dict) => <tr key={line.id}><td>{line.description}<div className="tiny faint">{line.sku}</div></td><td className="num">{Number(line.quantity).toFixed(3)}</td><td className="num">{formatMoney(line.unitPrice)}</td><td className="num">{formatMoney(line.discount)}</td><td className="num">{formatMoney(line.lineTotal)}</td></tr>)}</tbody></table></div>
            <div className="section-title"><h3>Pagos</h3></div>
            <div className="list">{sale.payments.map((payment: Dict) => <div className="list-row" key={payment.id}><div className="avatar">{payment.method.slice(0, 1)}</div><div className="grow"><div>{payment.method} · {formatMoney(payment.amount)}</div><div className="meta">{payment.received ? `Recibido ${formatMoney(payment.received)} · cambio ${formatMoney(payment.change ?? 0)}` : 'Sin efectivo recibido'}</div></div></div>)}</div>
            {sale.returns?.length > 0 && <><div className="section-title"><h3>Devoluciones</h3></div><div className="list">{sale.returns.map((r: Dict) => <div className="list-row" key={r.id}><RotateCcw /><div className="grow"><div>{r.number} · {formatMoney(r.total)}</div><div className="meta">{r.reason} · {r.waste ? 'Desperdicio' : 'Reintegrado'}</div></div></div>)}</div></>}
          </>
        )}
      </Modal>

      <Modal open={Boolean(receipt)} title="Comprobante" onClose={() => setReceipt(null)}>
        {receipt && <ReceiptPreview snapshot={receipt} width={receiptWidth} onClose={() => setReceipt(null)} />}
        <div className="flex gap-2 mt-2">{(['58', '80', 'a4'] as const).map((width) => <button key={width} className={`choice ${receiptWidth === width ? 'active' : ''}`} onClick={() => setReceiptWidth(width)}>{width === 'a4' ? 'A4' : `${width} mm`}</button>)}</div>
      </Modal>

      <Modal open={returnOpen} title={`Devolución de ${sale?.number ?? ''}`} onClose={() => setReturnOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setReturnOpen(false)}>Cancelar</button><button className="btn danger" onClick={() => createReturn.mutate()} disabled={createReturn.isPending || !returnForm.reason}>Registrar devolución</button></>}>
        {sale && <div className="flex-col gap-3">
          <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th className="num">Vendido</th><th className="num">Ya devuelto</th><th className="num">Devolver</th></tr></thead><tbody>{sale.lines.map((line: Dict) => { const available = Number(line.quantity) - alreadyReturned(line.id); return <tr key={line.id}><td>{line.description}</td><td className="num">{Number(line.quantity).toFixed(3)}</td><td className="num">{alreadyReturned(line.id).toFixed(3)}</td><td><input className="input" style={{ width: 100 }} inputMode="decimal" value={returnForm.quantities[line.id] ?? ''} disabled={available <= 0} onChange={(e) => setReturnForm({ ...returnForm, quantities: { ...returnForm.quantities, [line.id]: e.target.value } })} placeholder={`máx ${available.toFixed(3)}`} /></td></tr>; })}</tbody></table></div>
          <div className="form-grid">
            <Field label="Motivo (obligatorio)"><input className="input" value={returnForm.reason} onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })} /></Field>
            <Field label="Método de reembolso"><select className="select" value={returnForm.refundMethod} onChange={(e) => setReturnForm({ ...returnForm, refundMethod: e.target.value })}><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option><option value="OTHER">Otro</option></select></Field>
          </div>
          <label className="checkbox"><input type="checkbox" checked={returnForm.waste} onChange={(e) => setReturnForm({ ...returnForm, waste: e.target.checked })} /> No reingresar a inventario (desperdicio o producto dañado)</label>
          <div className="alert warning"><RotateCcw /><p>La devolución genera un documento relacionado; la venta original no se borra. El efectivo requiere una caja abierta.</p></div>
        </div>}
      </Modal>
    </>
  );
}
