import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Package, Wallet } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, download, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { Card, EmptyState, ErrorNotice, Loading, PageHeader } from '../../components/ui';

type Dict = Record<string, any>;

export function ReportsPage() {
  const tenant = useTenant();
  const [from, setFrom] = useState(new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const sales = useQuery({ queryKey: ['report-sales', from, to], queryFn: () => api.get<Dict>(`/tenant/reports/sales${queryString({ from, to })}`) });
  const products = useQuery({ queryKey: ['report-products', from, to], queryFn: () => api.get<Dict[]>(`/tenant/reports/products${queryString({ from, to })}`) });
  const inventory = useQuery({ queryKey: ['report-inventory'], queryFn: () => api.get<Dict>('/tenant/reports/inventory') });
  return (
    <>
      <PageHeader title="Reportes" description="Ventas, medios de pago, productos, inventario y márgenes del periodo." actions={<button className="btn ghost" onClick={() => download(`/tenant/reports/sales.csv${queryString({ from, to })}`, `ventas-${from}-${to}.csv`)}><Download /> Exportar CSV</button>} />
      <div className="toolbar"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 180 }} /><span className="muted">hasta</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 180 }} /></div>
      {sales.isLoading ? <Loading /> : sales.error ? <ErrorNotice error={sales.error} /> : (
        <>
          <div className="grid grid-4">
            <div className="card stat"><div className="stat-label">Ventas netas</div><div className="stat-value"><Money value={sales.data!.total} /></div><div className="stat-sub">{sales.data!.count} comprobantes</div></div>
            <div className="card stat"><div className="stat-label">Impuestos</div><div className="stat-value"><Money value={sales.data!.tax} /></div><div className="stat-sub">Descuentos {formatMoney(sales.data!.discount)}</div></div>
            <div className="card stat"><div className="stat-label">Devoluciones</div><div className="stat-value"><Money value={sales.data!.returns} /></div><div className="stat-sub">{sales.data!.returnsCount} documentos</div></div>
            <div className="card stat"><div className="stat-label">Propinas</div><div className="stat-value"><Money value={sales.data!.tips} /></div><div className="stat-sub">Aceptadas expresamente</div></div>
          </div>
          <div className="grid grid-2 mt-3">
            <Card title="Ventas por día"><div className="list">{sales.data!.byDay.length === 0 ? <EmptyState title="Sin ventas en el periodo" /> : sales.data!.byDay.map((day: Dict) => <div className="list-row" key={day.date}><div className="grow"><div>{new Date(`${day.date}T12:00:00`).toLocaleDateString('es-CO', { dateStyle: 'medium' })}</div><div className="meta">{day.count} ventas</div></div><strong>{formatMoney(day.total)}</strong></div>)}</div></Card>
            <Card title="Medios de pago"><div className="list">{sales.data!.byPaymentMethod.map((p: Dict) => <div className="list-row" key={p.method}><div className="avatar">{p.method.slice(0, 1)}</div><div className="grow">{p.method}</div><strong>{formatMoney(p.total)}</strong></div>)}</div></Card>
          </div>
          <Card title="Productos vendidos" className="mt-3">
            {products.isLoading ? <Loading /> : products.data!.length === 0 ? <EmptyState title="Sin productos vendidos" icon={<Package />} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Descuento</th><th className="num">Impuesto</th><th className="num">Total</th></tr></thead><tbody>{products.data!.map((p, index) => <tr key={`${p.productId}-${index}`}><td>{p.description}</td><td className="num">{Number(p.quantity).toFixed(3)}</td><td className="num">{formatMoney(p.discount)}</td><td className="num">{formatMoney(p.tax)}</td><td className="num strong">{formatMoney(p.total)}</td></tr>)}</tbody></table></div>}
          </Card>
          <Card title="Inventario y márgenes" className="mt-3">
            {inventory.isLoading ? <Loading /> : inventory.error ? <ErrorNotice error={inventory.error} /> : <div className="grid grid-3"><div className="card tight"><div className="stat-label">Costo del inventario</div><div className="stat-value"><Money value={inventory.data!.totalCost} /></div></div><div className="card tight"><div className="stat-label">Valor a precio de venta</div><div className="stat-value"><Money value={inventory.data!.totalRetail} /></div></div><div className="card tight"><div className="stat-label">Margen bruto</div><div className="stat-value">{Number(inventory.data!.margin).toFixed(1)}%</div></div></div>}
            {inventory.data?.lowStock?.length > 0 && <div className="mt-2"><div className="section-title"><h3>Bajo mínimo</h3></div><div className="table-wrap"><table className="table compact"><thead><tr><th>Producto</th><th>Bodega</th><th className="num">Cantidad</th><th className="num">Mínimo</th></tr></thead><tbody>{inventory.data!.lowStock.map((row: Dict, index: number) => <tr key={index}><td>{row.product}<div className="tiny faint">{row.sku}</div></td><td>{row.warehouse}</td><td className="num">{row.quantity}</td><td className="num">{row.reorderPoint}</td></tr>)}</tbody></table></div></div>}
          </Card>
        </>
      )}
    </>
  );
}

function Money({ value }: { value: string | number }) {
  return <>{formatMoney(value)}</>;
}
