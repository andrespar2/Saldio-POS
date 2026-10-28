import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  BarChart3,
  Boxes,
  ChefHat,
  CreditCard,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { Card, EmptyState, ErrorNotice, Loading, Money, PageHeader, StatusBadge } from '../../components/ui';

interface Dashboard {
  today: { total: string; count: number; average: string };
  cashSessions: Array<{ id: string; register: { name: string }; openingAmount: string }>;
  lowStockProducts: number;
  receivables: string;
  recentSales: Array<{ id: string; number: string; total: string; status: string; createdAt: string; customer?: { name: string } | null }>;
  topProducts: Array<{ productId: string; name: string; quantity: string; total: string }>;
  daily: Array<{ date: string; total: string }>;
}

export function TenantDashboard() {
  const tenant = useTenant();
  const store = tenant.data!.store;
  const query = useQuery({
    queryKey: ['tenant-dashboard'],
    queryFn: () => api.get<Dashboard>('/tenant/reports/dashboard'),
    enabled: tenant.hasModule('REPORTS'),
  });
  const max = Math.max(...(query.data?.daily.map((d) => Number(d.total)) ?? [0]), 1);

  return (
    <>
      <PageHeader
        title={`Hola, ${store.name}`}
        description={`${store.plan?.name ?? 'Sin plan'} · ${store.city}. Resumen de la operación de hoy.`}
        actions={<><Link className="btn primary" to="/app/pos"><ShoppingCart /> Abrir POS</Link><Link className="btn ghost" to="/app/onboarding">Configuración inicial</Link></>}
      />
      {!tenant.hasModule('REPORTS') ? (
        <Card><EmptyState title="Reportes no incluidos en el plan" description="Puede seguir operando con el punto de venta y el inventario. Solicite una ampliación de plan si necesita métricas." action={<Link className="btn primary" to="/app/pos">Ir al POS</Link>} /></Card>
      ) : query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <>
          <div className="grid grid-4">
            <div className="card stat"><div className="stat-label">Ventas de hoy</div><div className="stat-value"><Money value={query.data!.today.total} /></div><div className="stat-sub">{query.data!.today.count} comprobantes · ticket promedio <Money value={query.data!.today.average} /></div></div>
            <div className="card stat"><div className="stat-label">Cajas abiertas</div><div className="stat-value">{query.data!.cashSessions.length}</div><div className="stat-sub">{query.data!.cashSessions.map((s) => s.register.name).join(', ') || 'Ninguna caja abierta'}</div></div>
            <div className="card stat"><div className="stat-label">Cartera pendiente</div><div className="stat-value"><Money value={query.data!.receivables} /></div><div className="stat-sub">Saldos de ventas a crédito</div></div>
            <div className="card stat"><div className="stat-label">Alertas de stock</div><div className="stat-value">{query.data!.lowStockProducts}</div><div className="stat-sub">Productos en o bajo el mínimo</div></div>
          </div>
          <div className="split mt-3">
            <Card title="Tendencia de 7 días" subtitle="Ventas confirmadas por día">
              <div className="flex items-end gap-2" style={{ height: 190, paddingTop: 12 }}>
                {query.data!.daily.map((day) => (
                  <div key={day.date} className="flex-col items-center grow" style={{ height: '100%', justifyContent: 'flex-end', gap: 6 }}>
                    <div className="tiny muted"><Money value={day.total} /></div>
                    <div title={`${day.date}: ${day.total}`} style={{ width: '100%', maxWidth: 46, height: `${Math.max(4, (Number(day.total) / max) * 130)}px`, background: 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 35%, transparent))', borderRadius: '7px 7px 3px 3px' }} />
                    <div className="tiny faint">{new Date(`${day.date}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short' })}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Accesos rápidos">
              <div className="grid grid-2">
                <Link className="btn ghost" to="/app/pos"><ShoppingCart /> POS</Link>
                <Link className="btn ghost" to="/app/cash"><Wallet /> Caja</Link>
                <Link className="btn ghost" to="/app/products"><Package /> Productos</Link>
                <Link className="btn ghost" to="/app/inventory"><Boxes /> Inventario</Link>
                <Link className="btn ghost" to="/app/sales"><Receipt /> Ventas</Link>
                <Link className="btn ghost" to="/app/reports"><BarChart3 /> Reportes</Link>
                {tenant.hasModule('RESTAURANT') && <Link className="btn ghost" to="/app/restaurant"><ChefHat /> Mesas</Link>}
                {tenant.hasModule('CREDITS') && <Link className="btn ghost" to="/app/receivables"><CreditCard /> Cartera</Link>}
                {tenant.hasModule('PURCHASES') && <Link className="btn ghost" to="/app/purchases"><Package /> Compras</Link>}
              </div>
              {query.data!.cashSessions.length === 0 && <div className="alert warning mt-3"><Banknote /><p>No hay una caja abierta. Ábrala antes de recibir efectivo.</p></div>}
            </Card>
          </div>
          <div className="grid grid-2 mt-3">
            <Card title="Últimas ventas" actions={<Link className="btn sm ghost" to="/app/sales">Ver todas</Link>}>
              {query.data!.recentSales.length === 0 ? <EmptyState title="Aún no hay ventas" description="La primera venta aparecerá aquí." /> : (
                <div className="list">{query.data!.recentSales.map((sale) => <div className="list-row" key={sale.id}><div className="avatar">{sale.number.slice(-2)}</div><div className="grow"><div className="strong">{sale.number}</div><div className="meta">{sale.customer?.name ?? 'Consumidor final'} · {new Date(sale.createdAt).toLocaleTimeString('es-CO')}</div></div><StatusBadge status={sale.status} /><strong className="nowrap"><Money value={sale.total} /></strong></div>)}</div>
              )}
            </Card>
            <Card title="Productos más vendidos" subtitle="Últimos 7 días">
              {query.data!.topProducts.length === 0 ? <EmptyState title="Sin datos todavía" /> : (
                <div className="list">{query.data!.topProducts.map((product, index) => <div className="list-row" key={product.productId}><div className="avatar">{index + 1}</div><div className="grow"><div>{product.name}</div><div className="meta">{product.quantity} unidades</div></div><strong><Money value={product.total} /></strong></div>)}</div>
              )}
            </Card>
          </div>
          <div className="grid grid-4 mt-3">
            <Link to="/app/customers" className="card tight flex items-center gap-2"><Users /><span>Clientes</span></Link>
            {tenant.hasModule('PURCHASES') && <Link to="/app/purchases" className="card tight flex items-center gap-2"><Package /><span>Compras</span></Link>}
            <Link to="/app/expenses" className="card tight flex items-center gap-2"><Banknote /><span>Gastos</span></Link>
            <Link to="/app/users" className="card tight flex items-center gap-2"><Users /><span>Equipo</span></Link>
          </div>
        </>
      )}
    </>
  );
}
