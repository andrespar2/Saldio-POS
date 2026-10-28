import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileText,
  Fuel,
  Gem,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Package,
  PlusCircle,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { TenantProvider, useTenant } from '../lib/tenant';
import { Loading, StatusBadge } from './ui';
import { toast } from '../lib/toast';

export function RequireAuth({ children, area }: { children: ReactNode; area: 'admin' | 'tenant' }) {
  const { me, loading } = useAuth();
  if (loading) return <Loading label="Validando sesión…" />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (area === 'admin' && !me.platform) return <Navigate to={me.store ? '/app' : '/login'} replace />;
  if (area === 'admin' && me.store) return <Navigate to="/app" replace />;
  if (area === 'tenant' && !me.store) return <Navigate to={me.platform ? '/admin' : '/login'} replace />;
  return <>{children}</>;
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  module?: string;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const adminNav: NavGroup[] = [
  {
    label: 'Plataforma',
    items: [
      { to: '/admin', label: 'Resumen', icon: <LayoutDashboard />, end: true },
      { to: '/admin/stores', label: 'Tiendas', icon: <Store /> },
      { to: '/admin/admins', label: 'Administradores', icon: <ShieldCheck /> },
      { to: '/admin/plans', label: 'Planes y complementos', icon: <Gem /> },
    ],
  },
  {
    label: 'Operación',
    items: [
      { to: '/admin/audit', label: 'Auditoría', icon: <ClipboardList /> },
      { to: '/admin/operations', label: 'Servicio y trabajos', icon: <Activity /> },
      { to: '/admin/settings', label: 'Configuración', icon: <Settings /> },
    ],
  },
];

function tenantNav(can: (p: string) => boolean, hasModule: (m: string) => boolean): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: 'Operación',
      items: [
        { to: '/app', label: 'Resumen', icon: <LayoutDashboard />, end: true },
        { to: '/app/pos', label: 'Punto de venta', icon: <ShoppingCart />, permission: 'sales.sell', module: 'POS' },
        { to: '/app/sales', label: 'Ventas y comprobantes', icon: <Receipt />, permission: 'sales.read' },
        { to: '/app/cash', label: 'Caja', icon: <Wallet />, permission: 'cash.open' },
        { to: '/app/restaurant', label: 'Mesas y pedidos', icon: <UtensilsCrossed />, permission: 'restaurant.read', module: 'RESTAURANT' },
        { to: '/app/kitchen', label: 'Cocina', icon: <ChefHat />, permission: 'kitchen.read', module: 'KITCHEN' },
        { to: '/app/receivables', label: 'Cartera', icon: <CreditCard />, permission: 'credit.manage', module: 'CREDITS' },
        { to: '/app/quotes', label: 'Cotizaciones', icon: <FileText />, permission: 'quotes.manage', module: 'QUOTES' },
        { to: '/app/expenses', label: 'Gastos', icon: <Banknote />, permission: 'expenses.manage', module: 'EXPENSES' },
      ],
    },
    {
      label: 'Inventario',
      items: [
        { to: '/app/products', label: 'Productos', icon: <Package />, permission: 'catalog.read' },
        { to: '/app/inventory', label: 'Existencias', icon: <Boxes />, permission: 'inventory.read', module: 'INVENTORY' },
        { to: '/app/purchases', label: 'Compras', icon: <Truck />, permission: 'purchases.read', module: 'PURCHASES' },
        { to: '/app/customers', label: 'Clientes', icon: <Users />, permission: 'customers.read' },
        { to: '/app/suppliers', label: 'Proveedores', icon: <Building2 />, permission: 'suppliers.read', module: 'SUPPLIERS' },
      ],
    },
    {
      label: 'Análisis',
      items: [
        { to: '/app/reports', label: 'Reportes', icon: <BarChart3 />, permission: 'reports.read', module: 'REPORTS' },
        { to: '/app/accounting', label: 'Contabilidad', icon: <BookOpen />, permission: 'accounting.read', module: 'ACCOUNTING' },
      ],
    },
    {
      label: 'Configuración',
      items: [
        { to: '/app/onboarding', label: 'Asistente inicial', icon: <ListChecks />, permission: 'settings.manage' },
        { to: '/app/users', label: 'Usuarios y empleados', icon: <UserCog />, permission: 'users.manage' },
        { to: '/app/integrations', label: 'Integraciones', icon: <BadgeDollarSign />, permission: 'settings.manage' },
        { to: '/app/settings', label: 'Tienda', icon: <Settings />, permission: 'settings.manage' },
        { to: '/app/profile', label: 'Mi perfil', icon: <ShieldCheck /> },
      ],
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.permission || can(item.permission)) &&
          (!item.module || hasModule(item.module)),
      ),
    }))
    .filter((group) => group.items.length);
}

function Brand() {
  return (
    <div className="brand">
      <img src="/brand/saldio-icon.svg" alt="" />
      <div>
        <div className="brand-name">Saldio POS</div>
        <div className="brand-sub">gestión que cuadra</div>
      </div>
    </div>
  );
}

function SidebarContent({ groups, footer }: { groups: NavGroup[]; footer: ReactNode }) {
  return (
    <>
      <Brand />
      <nav aria-label="Navegación principal" className="flex-col gap-1">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => document.body.classList.remove('nav-open')}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">{footer}</div>
    </>
  );
}

function Topbar({
  title,
  context,
  onMenu,
  menu,
}: {
  title: string;
  context?: string;
  onMenu: () => void;
  menu: ReactNode;
}) {
  const { effectiveTheme, setMode } = useTheme();
  return (
    <header className="topbar">
      <button className="btn icon ghost hide-desktop" onClick={onMenu} aria-label="Abrir menú"><Menu size={18} /></button>
      <div>
        <div className="topbar-title">{title}</div>
        {context && <div className="topbar-context">{context}</div>}
      </div>
      <div className="topbar-actions">
        <button
          className="btn icon ghost"
          onClick={() => setMode(effectiveTheme === 'dark' ? 'light' : 'dark')}
          aria-label="Cambiar tema"
          title="Cambiar tema"
        >
          {effectiveTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {menu}
      </div>
    </header>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  if (!me) return null;
  const initials = me.user.fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn ghost sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="avatar" style={{ width: 24, height: 24, fontSize: 10, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontWeight: 700 }}>{initials}</span>
        <span className="hide-mobile">{me.user.fullName.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="card solid" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 230, padding: 10, zIndex: 50 }}>
          <div style={{ padding: '6px 8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div className="strong">{me.user.fullName}</div>
            <div className="small muted">@{me.user.username}</div>
          </div>
          <button className="nav-link" onClick={() => { setOpen(false); navigate(me.store ? '/app/profile' : '/change-password'); }}><ShieldCheck /> Mi perfil</button>
          <button className="nav-link" onClick={() => { setOpen(false); navigate(me.store ? '/app/settings' : '/admin/settings'); }}><Settings /> Preferencias</button>
          <button className="nav-link" onClick={async () => { await logout(); navigate('/login'); }}><LogOut /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => { setOffline(false); toast.success('Conexión restablecida.'); };
    const off = () => { setOffline(true); toast.warning('Sin conexión. Las operaciones no se confirmarán hasta recuperar la red.'); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return <div className="banner disconnected no-print"><WifiOff size={16} /> Sin conexión. Los borradores permanecen en este equipo; las ventas requieren conexión para confirmarse.</div>;
}

function PreferenceSync() {
  const { me } = useAuth();
  const { applyPreferences } = useTheme();
  const applied = useRef(false);
  const query = useQuery({
    queryKey: ['preferences', me?.user.id],
    queryFn: () => api.get<Record<string, unknown>>('/auth/preferences'),
    enabled: Boolean(me) && !applied.current,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (query.data && !applied.current) {
      applied.current = true;
      applyPreferences(query.data as never);
    }
  }, [query.data, applyPreferences]);
  return null;
}

export function AdminShell() {
  const { me, loading } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (me.store) return <Navigate to="/app" replace />;
  const title =
    location.pathname.startsWith('/admin/stores') ? 'Tiendas'
      : location.pathname.startsWith('/admin/admins') ? 'Administradores'
        : location.pathname.startsWith('/admin/plans') ? 'Planes'
          : location.pathname.startsWith('/admin/audit') ? 'Auditoría'
            : location.pathname.startsWith('/admin/operations') ? 'Servicio'
              : location.pathname.startsWith('/admin/settings') ? 'Configuración'
                : 'Administración de plataforma';
  return (
    <div className={`app-shell ${open ? 'nav-open' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <SidebarContent
          groups={adminNav}
          footer={<><div className="strong" style={{ color: 'var(--text)' }}>{me.user.fullName}</div><div>{me.user.platformRole}</div><div className="mt-2"><button className="btn sm ghost block" onClick={() => { window.location.hash = '#/login'; localStorage.clear(); window.location.reload(); }}>Salir</button></div></>}
        />
      </aside>
      <div className="main-wrap">
        <OfflineBanner />
        <Topbar title={title} context="Panel de administración" onMenu={() => setOpen((v) => !v)} menu={<UserMenu />} />
        <main className="content"><Outlet /></main>
      </div>
      {open && <div className="modal-backdrop hide-desktop" onClick={() => setOpen(false)} />}
    </div>
  );
}

function StoreBlocked({ status, reason, endsAt }: { status: string; reason?: string | null; endsAt?: string | null }) {
  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="auth-panel">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <img src="/brand/saldio-icon.svg" alt="" style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px' }} />
          <h1>Acceso temporalmente restringido</h1>
          <p className="lead">
            {status === 'PENDING'
              ? 'Su tienda está pendiente de aprobación. Podrá operar cuando la plataforma la active.'
              : status === 'SUSPENDED'
                ? `La tienda está suspendida temporalmente. ${reason ? `Motivo: ${reason}.` : ''}`
                : 'La tienda está deshabilitada permanentemente.'}
          </p>
          {endsAt && <p className="small muted">Suspensión programada hasta {new Date(endsAt).toLocaleString('es-CO')}.</p>}
          <div className="alert info mt-3" style={{ textAlign: 'left' }}><LifeBuoy /><div><p>Conserve sus datos. No se eliminaron ventas, comprobantes ni información contable.</p><p className="small mt-1">Soporte: soporte@saldio.app</p></div></div>
          <button className="btn ghost mt-3" onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.hash = '#/login'; window.location.reload(); }}>Cerrar sesión</button>
        </div>
      </main>
    </div>
  );
}

export function TenantShell() {
  const { me, loading, exitSupport } = useAuth();
  return (
    <TenantProvider>
      <TenantShellInner me={me} loading={loading} exitSupport={exitSupport} />
    </TenantProvider>
  );
}

function TenantShellInner({ me, loading, exitSupport }: { me: ReturnType<typeof useAuth>['me']; loading: boolean; exitSupport: () => void }) {
  const tenant = useTenant();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!me.store) return <Navigate to="/login" replace />;
  if (me.store.status !== 'ACTIVE') {
    return <StoreBlocked status={me.store.status} />;
  }
  if (tenant.loading) return <Loading label="Cargando tienda…" />;
  if (tenant.error) {
    if (tenant.error instanceof ApiError && tenant.error.code?.startsWith('STORE_')) {
      return <StoreBlocked status={me.store.status} />;
    }
    return (
      <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
        <main className="auth-panel"><div className="auth-card"><h1>No se pudo cargar la tienda</h1><p className="lead">{(tenant.error as Error).message}</p><button className="btn primary" onClick={tenant.refetch}><RefreshCw /> Reintentar</button></div></main>
      </div>
    );
  }
  if (!tenant.data) return <Loading />;
  const groups = tenantNav(tenant.can, tenant.hasModule);
  const title =
    location.pathname === '/app' ? 'Resumen'
      : location.pathname.startsWith('/app/pos') ? 'Punto de venta'
        : location.pathname.startsWith('/app/sales') ? 'Ventas'
          : location.pathname.startsWith('/app/cash') ? 'Caja'
            : location.pathname.startsWith('/app/restaurant') ? 'Mesas y pedidos'
              : location.pathname.startsWith('/app/kitchen') ? 'Cocina'
                : location.pathname.startsWith('/app/receivables') ? 'Cartera'
                  : location.pathname.startsWith('/app/quotes') ? 'Cotizaciones'
                    : location.pathname.startsWith('/app/expenses') ? 'Gastos'
                      : location.pathname.startsWith('/app/products') ? 'Productos'
                        : location.pathname.startsWith('/app/inventory') ? 'Existencias'
                          : location.pathname.startsWith('/app/purchases') ? 'Compras'
                            : location.pathname.startsWith('/app/customers') ? 'Clientes'
                              : location.pathname.startsWith('/app/suppliers') ? 'Proveedores'
                                : location.pathname.startsWith('/app/reports') ? 'Reportes'
                                  : location.pathname.startsWith('/app/accounting') ? 'Contabilidad'
                                    : location.pathname.startsWith('/app/onboarding') ? 'Asistente inicial'
                                      : location.pathname.startsWith('/app/users') ? 'Usuarios y empleados'
                                        : location.pathname.startsWith('/app/integrations') ? 'Integraciones'
                                          : location.pathname.startsWith('/app/settings') ? 'Configuración de tienda'
                                            : location.pathname.startsWith('/app/profile') ? 'Mi perfil'
                                              : tenant.data.store.name;
  return (
    <div className={`app-shell ${open ? 'nav-open' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <SidebarContent
          groups={groups}
          footer={<>
            <div className="strong" style={{ color: 'var(--text)' }}>{tenant.data.store.name}</div>
            <div>{tenant.data.store.city} · {tenant.data.store.plan?.name}</div>
            <div className="mt-2"><StatusBadge status={tenant.data.store.status} /></div>
          </>}
        />
      </aside>
      <div className="main-wrap">
        <OfflineBanner />
        {me.readOnly && (
          <div className="banner no-print">
            <ShieldCheck size={16} /> Modo soporte de solo lectura. Cada acceso queda auditado.
            <button className="btn sm ghost" onClick={exitSupport}>Salir de soporte</button>
          </div>
        )}
        <Topbar title={title} context={`${tenant.data.store.name} · ${tenant.data.store.plan?.name ?? 'Sin plan'}`} onMenu={() => setOpen((v) => !v)} menu={<UserMenu />} />
        <main className="content"><Outlet /></main>
      </div>
      {open && <div className="modal-backdrop hide-desktop" onClick={() => setOpen(false)} />}
    </div>
  );
}

export function AccessDenied({ message = 'No tiene permiso para ver esta sección.' }: { message?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon"><ShieldCheck /></div>
      <h3>Acceso restringido</h3>
      <p className="small">{message}</p>
      <a className="btn ghost mt-2" href="#/app">Volver al resumen</a>
    </div>
  );
}
