import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import { AdminShell, AccessDenied, RequireAuth, TenantShell } from './components/shell';
import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/auth/AuthPages';
import { useTenant } from './lib/tenant';

const PlatformDashboard = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformDashboard })));
const PlatformStores = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformStores })));
const PlatformStoreDetail = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformStoreDetail })));
const PlatformAdmins = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformAdmins })));
const PlatformPlans = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformPlans })));
const PlatformAudit = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformAudit })));
const PlatformOperations = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformOperations })));
const PlatformSettings = lazy(() => import('./pages/platform/PlatformPages').then((m) => ({ default: m.PlatformSettings })));

const TenantDashboard = lazy(() => import('./pages/tenant/TenantDashboard').then((m) => ({ default: m.TenantDashboard })));
const PosPage = lazy(() => import('./pages/tenant/PosPage').then((m) => ({ default: m.PosPage })));
const ProductsPage = lazy(() => import('./pages/tenant/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import('./pages/tenant/InventoryPages').then((m) => ({ default: m.InventoryPage })));
const PurchasesPage = lazy(() => import('./pages/tenant/InventoryPages').then((m) => ({ default: m.PurchasesPage })));
const CustomersPage = lazy(() => import('./pages/tenant/PartiesPages').then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = lazy(() => import('./pages/tenant/PartiesPages').then((m) => ({ default: m.SuppliersPage })));
const SalesPage = lazy(() => import('./pages/tenant/SalesPage').then((m) => ({ default: m.SalesPage })));
const CashPage = lazy(() => import('./pages/tenant/CashPage').then((m) => ({ default: m.CashPage })));
const RestaurantPage = lazy(() => import('./pages/tenant/RestaurantPage').then((m) => ({ default: m.RestaurantPage })));
const KitchenPage = lazy(() => import('./pages/tenant/RestaurantPage').then((m) => ({ default: m.KitchenPage })));
const ReceivablesPage = lazy(() => import('./pages/tenant/FinancePages').then((m) => ({ default: m.ReceivablesPage })));
const QuotesPage = lazy(() => import('./pages/tenant/FinancePages').then((m) => ({ default: m.QuotesPage })));
const ExpensesPage = lazy(() => import('./pages/tenant/FinancePages').then((m) => ({ default: m.ExpensesPage })));
const AccountingPage = lazy(() => import('./pages/tenant/AccountingPage').then((m) => ({ default: m.AccountingPage })));
const ReportsPage = lazy(() => import('./pages/tenant/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const OnboardingPage = lazy(() => import('./pages/tenant/TenantSettingsPages').then((m) => ({ default: m.OnboardingPage })));
const TenantUsersPage = lazy(() => import('./pages/tenant/TenantSettingsPages').then((m) => ({ default: m.TenantUsersPage })));
const TenantSettingsPage = lazy(() => import('./pages/tenant/TenantSettingsPages').then((m) => ({ default: m.TenantSettingsPage })));
const IntegrationsPage = lazy(() => import('./pages/tenant/TenantSettingsPages').then((m) => ({ default: m.IntegrationsPage })));
const ProfilePage = lazy(() => import('./pages/tenant/TenantSettingsPages').then((m) => ({ default: m.ProfilePage })));

function RootRedirect() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  return <Navigate to={me.store ? '/app' : me.platform ? '/admin' : '/login'} replace />;
}

function ModuleGuard({ module, permission, children }: { module?: string; permission?: string; children: React.ReactNode }) {
  const tenant = useTenant();
  if (module && !tenant.hasModule(module)) return <AccessDenied message="El módulo no está incluido en el plan o está deshabilitado." />;
  if (permission && !tenant.can(permission)) return <AccessDenied />;
  return <>{children}</>;
}

function NotFound() {
  return <div className="empty"><h1>404</h1><p>La página no existe.</p><a className="btn primary mt-2" href="#/">Volver</a></div>;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<RequireAuth area="admin"><AdminShell /></RequireAuth>}>
          <Route path="/admin" element={<PlatformDashboard />} />
          <Route path="/admin/stores" element={<PlatformStores />} />
          <Route path="/admin/stores/:id" element={<PlatformStoreDetail />} />
          <Route path="/admin/admins" element={<PlatformAdmins />} />
          <Route path="/admin/plans" element={<PlatformPlans />} />
          <Route path="/admin/audit" element={<PlatformAudit />} />
          <Route path="/admin/operations" element={<PlatformOperations />} />
          <Route path="/admin/settings" element={<PlatformSettings />} />
        </Route>

        <Route element={<RequireAuth area="tenant"><TenantShell /></RequireAuth>}>
          <Route path="/app" element={<TenantDashboard />} />
          <Route path="/app/pos" element={<ModuleGuard permission="sales.sell" module="POS"><PosPage /></ModuleGuard>} />
          <Route path="/app/sales" element={<ModuleGuard permission="sales.read"><SalesPage /></ModuleGuard>} />
          <Route path="/app/cash" element={<ModuleGuard permission="cash.open"><CashPage /></ModuleGuard>} />
          <Route path="/app/restaurant" element={<ModuleGuard permission="restaurant.read" module="RESTAURANT"><RestaurantPage /></ModuleGuard>} />
          <Route path="/app/kitchen" element={<ModuleGuard permission="kitchen.read" module="KITCHEN"><KitchenPage /></ModuleGuard>} />
          <Route path="/app/receivables" element={<ModuleGuard permission="credit.manage" module="CREDITS"><ReceivablesPage /></ModuleGuard>} />
          <Route path="/app/quotes" element={<ModuleGuard permission="quotes.manage" module="QUOTES"><QuotesPage /></ModuleGuard>} />
          <Route path="/app/expenses" element={<ModuleGuard permission="expenses.manage" module="EXPENSES"><ExpensesPage /></ModuleGuard>} />
          <Route path="/app/products" element={<ModuleGuard permission="catalog.read"><ProductsPage /></ModuleGuard>} />
          <Route path="/app/inventory" element={<ModuleGuard permission="inventory.read" module="INVENTORY"><InventoryPage /></ModuleGuard>} />
          <Route path="/app/purchases" element={<ModuleGuard permission="purchases.read" module="PURCHASES"><PurchasesPage /></ModuleGuard>} />
          <Route path="/app/customers" element={<ModuleGuard permission="customers.read"><CustomersPage /></ModuleGuard>} />
          <Route path="/app/suppliers" element={<ModuleGuard permission="suppliers.read" module="SUPPLIERS"><SuppliersPage /></ModuleGuard>} />
          <Route path="/app/reports" element={<ModuleGuard permission="reports.read" module="REPORTS"><ReportsPage /></ModuleGuard>} />
          <Route path="/app/accounting" element={<ModuleGuard permission="accounting.read" module="ACCOUNTING"><AccountingPage /></ModuleGuard>} />
          <Route path="/app/onboarding" element={<ModuleGuard permission="settings.manage"><OnboardingPage /></ModuleGuard>} />
          <Route path="/app/users" element={<ModuleGuard permission="users.manage"><TenantUsersPage /></ModuleGuard>} />
          <Route path="/app/integrations" element={<ModuleGuard permission="settings.manage"><IntegrationsPage /></ModuleGuard>} />
          <Route path="/app/settings" element={<ModuleGuard permission="settings.manage"><TenantSettingsPage /></ModuleGuard>} />
          <Route path="/app/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
