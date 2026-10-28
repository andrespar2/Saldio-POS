import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Store,
  UserCog,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, queryString } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTenant } from '../../lib/tenant';
import { useTheme, type Accent } from '../../lib/theme';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, Progress, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

const TASK_LABELS: Record<string, string> = {
  branch: 'Sucursal creada',
  warehouse: 'Bodega configurada',
  cash: 'Caja registradora',
  taxes: 'Impuestos',
  products: 'Primeros productos',
  employees: 'Equipo de trabajo',
  suppliers: 'Proveedores',
  tables: 'Mesas del salón',
  customers: 'Clientes',
};

export function OnboardingPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['onboarding'], queryFn: () => api.get<Dict>('/tenant/onboarding') });
  const mark = useMutation({
    mutationFn: ({ key, completed }: { key: string; completed: boolean }) => api.patch('/tenant/onboarding', { key, completed }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['onboarding'] }); void qc.invalidateQueries({ queryKey: ['tenant-access'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const tasks = query.data!.tasks as Dict[];
  const completed = tasks.filter((t) => t.completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <>
      <PageHeader title="Asistente inicial" description="Complete la configuración básica. El progreso se guarda en el servidor." />
      <Card title={`Progreso ${percent}%`} subtitle={`${completed} de ${tasks.length} pasos completados`}>
        <Progress value={percent} />
        <div className="grid grid-2 mt-3">
          {tasks.map((task) => (
            <div className="card tight" key={task.id}>
              <div className="flex items-start gap-2">
                <div className={`avatar ${task.completed ? 'success' : ''}`} style={{ background: task.completed ? 'var(--success-soft)' : undefined, color: task.completed ? 'var(--success)' : undefined }}>{task.completed ? <Check /> : <ArrowRight />}</div>
                <div className="grow"><div className="strong">{TASK_LABELS[task.key] ?? task.key}</div><div className="small muted">{task.completed ? 'Completado' : 'Pendiente'}</div></div>
                {!task.completed && <button className="btn sm ghost" onClick={() => mark.mutate({ key: task.key, completed: true })}>Marcar hecho</button>}
                {task.completed && <button className="btn sm ghost" onClick={() => mark.mutate({ key: task.key, completed: false })}>Reabrir</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-4 mt-3">
          <a className="btn ghost" href="#/app/settings"><Store /> Datos de tienda</a>
          <a className="btn ghost" href="#/app/products"><PackageIcon /> Productos</a>
          <a className="btn ghost" href="#/app/users"><UserCog /> Equipo</a>
          <a className="btn ghost" href="#/app/pos"><Wallet /> Abrir POS</a>
        </div>
      </Card>
      <Card title="Siguiente paso recomendado" className="mt-3">
        <ol className="small muted" style={{ paddingLeft: 18 }}><li>Verifique la sucursal, bodega y caja creadas automáticamente.</li><li>Registre productos con stock inicial o una compra.</li><li>Cree usuarios con roles de cajero o inventario.</li><li>Abra la caja y realice una venta de prueba.</li></ol>
      </Card>
    </>
  );
}

function PackageIcon() { return <ListChecks size={16} />; }

export function TenantUsersPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dict | null>(null);
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '', role: 'CASHIER', branchId: '' });
  const [temp, setTemp] = useState<string | null>(null);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employee, setEmployee] = useState({ name: '', document: '', phone: '', role: 'CASHIER', branchId: '' });
  const users = useQuery({ queryKey: ['tenant-users'], queryFn: () => api.get<Dict[]>('/tenant/users') });
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => api.get<Dict[]>('/tenant/employees') });
  const create = useMutation({
    mutationFn: () => api.post('/tenant/users', { ...form, email: form.email || undefined, branchId: form.branchId || undefined }),
    onSuccess: () => { toast.success('Usuario creado. Debe cambiar la contraseña al ingresar.'); setOpen(false); setForm({ fullName: '', username: '', email: '', password: '', role: 'CASHIER', branchId: '' }); void qc.invalidateQueries({ queryKey: ['tenant-users'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Dict }) => api.patch(`/tenant/users/${id}`, payload),
    onSuccess: () => { toast.success('Usuario actualizado.'); setEditing(null); void qc.invalidateQueries({ queryKey: ['tenant-users'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const reset = useMutation({
    mutationFn: (id: string) => api.post<{ temporaryPassword: string }>(`/tenant/users/${id}/reset-password`, { reason: 'Restablecimiento por administrador de tienda' }),
    onSuccess: (data) => setTemp(data.temporaryPassword),
    onError: (error) => toast.error((error as Error).message),
  });
  const addEmployee = useMutation({
    mutationFn: () => api.post('/tenant/employees', { ...employee, branchId: employee.branchId || undefined }),
    onSuccess: () => { toast.success('Empleado creado.'); setEmployeeOpen(false); void qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <>
      <PageHeader title="Usuarios y empleados" description="Accesos, roles y personal. El propietario activo no puede quedar sin reemplazo." actions={<><button className="btn ghost" onClick={() => { setEmployee({ ...employee, branchId: tenant.data!.branches[0]?.id ?? '' }); setEmployeeOpen(true); }}><Plus /> Empleado</button><button className="btn primary" onClick={() => { setForm({ ...form, branchId: tenant.data!.branches[0]?.id ?? '' }); setOpen(true); }}><Plus /> Usuario</button></>} />
      <Card title="Usuarios con acceso">
        {users.isLoading ? <Loading /> : users.error ? <ErrorNotice error={users.error} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th /></tr></thead><tbody>{(users.data ?? []).map((m) => <tr key={m.id}><td className="mono">{m.user.username}<div className="tiny faint">{m.user.email ?? 'Sin correo'}</div></td><td>{m.user.fullName}</td><td><span className="badge accent">{m.role}</span></td><td>{m.branch?.name ?? 'Todas'}</td><td>{m.active ? <span className="badge success">Activo</span> : <span className="badge danger">Inactivo</span>}</td><td className="text-right"><button className="btn sm ghost" onClick={() => setEditing(m)}>Editar</button><button className="btn sm ghost" onClick={() => reset.mutate(m.id)}><KeyRound /></button></td></tr>)}</tbody></table></div>}
      </Card>
      <Card title="Empleados sin acceso al sistema" className="mt-3">
        {employees.isLoading ? <Loading /> : <div className="table-wrap"><table className="table"><thead><tr><th>Nombre</th><th>Documento</th><th>Rol</th><th>Teléfono</th><th>Estado</th></tr></thead><tbody>{(employees.data ?? []).map((e) => <tr key={e.id}><td>{e.name}</td><td>{e.document ?? '—'}</td><td>{e.role}</td><td>{e.phone ?? '—'}</td><td>{e.active ? <span className="badge success">Activo</span> : <span className="badge danger">Inactivo</span>}</td></tr>)}</tbody></table></div>}
      </Card>
      <Modal open={open} title="Nuevo usuario" onClose={() => setOpen(false)} footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}>Crear</button></>}>
        <div className="form-grid">
          <Field label="Nombre"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Usuario"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Correo"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Rol"><select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['OWNER', 'ADMIN', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'WAITER', 'KITCHEN'].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Sucursal"><select className="select" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">Todas</option>{tenant.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Contraseña inicial" hint="El usuario deberá cambiarla."><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={Boolean(editing)} title={`Editar ${editing?.user.fullName ?? ''}`} onClose={() => setEditing(null)} footer={<><button className="btn ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" onClick={() => update.mutate({ id: editing!.id, payload: { role: editing!.role, active: editing!.active, branchId: editing!.branchId } })}>Guardar</button></>}>
        {editing && <div className="flex-col gap-3">
          <Field label="Rol"><select className="select" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>{['OWNER', 'ADMIN', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'WAITER', 'KITCHEN'].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Sucursal"><select className="select" value={editing.branchId ?? ''} onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}><option value="">Todas</option>{tenant.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <label className="checkbox"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Acceso activo</label>
        </div>}
      </Modal>
      <Modal open={employeeOpen} title="Nuevo empleado" onClose={() => setEmployeeOpen(false)} footer={<><button className="btn ghost" onClick={() => setEmployeeOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => addEmployee.mutate()}>Crear</button></>}>
        <div className="form-grid">
          <Field label="Nombre"><input className="input" value={employee.name} onChange={(e) => setEmployee({ ...employee, name: e.target.value })} /></Field>
          <Field label="Documento"><input className="input" value={employee.document} onChange={(e) => setEmployee({ ...employee, document: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="input" value={employee.phone} onChange={(e) => setEmployee({ ...employee, phone: e.target.value })} /></Field>
          <Field label="Rol"><select className="select" value={employee.role} onChange={(e) => setEmployee({ ...employee, role: e.target.value })}>{['CASHIER', 'INVENTORY', 'WAITER', 'KITCHEN', 'ACCOUNTANT'].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
        </div>
      </Modal>
      <Modal open={Boolean(temp)} title="Contraseña temporal" onClose={() => setTemp(null)} footer={<button className="btn primary" onClick={() => setTemp(null)}>Entendido</button>}>
        <div className="alert warning"><KeyRound /><p>Visible una sola vez. Se revocaron las sesiones anteriores; el usuario deberá cambiarla.</p></div>
        <div className="flex gap-2 mt-3"><input className="input mono" readOnly value={temp ?? ''} /><button className="btn ghost" onClick={() => { void navigator.clipboard.writeText(temp ?? ''); toast.success('Copiada.'); }}><Copy /></button></div>
      </Modal>
    </>
  );
}

const ACCENTS: Array<{ value: Accent; label: string; color: string }> = [
  { value: 'teal', label: 'Menta', color: '#0f9d8a' },
  { value: 'blue', label: 'Azul', color: '#2563eb' },
  { value: 'violet', label: 'Violeta', color: '#7c3aed' },
  { value: 'amber', label: 'Ámbar', color: '#b45309' },
  { value: 'rose', label: 'Rosa', color: '#be123c' },
];

export function TenantSettingsPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const theme = useTheme();
  const [storeForm, setStoreForm] = useState({ name: tenant.data!.store.name, legalName: tenant.data!.store.legalName ?? '', address: tenant.data!.store.address, city: tenant.data!.store.city, phone: tenant.data!.store.phone });
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: '', code: '', address: '', city: '' });
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ branchId: tenant.data!.branches[0]?.id ?? '', name: '', code: '' });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ branchId: tenant.data!.branches[0]?.id ?? '', name: '', code: '' });
  const [logoBusy, setLogoBusy] = useState(false);
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Dict[]>('/tenant/warehouses') });
  const registers = useQuery({ queryKey: ['registers'], queryFn: () => api.get<Dict[]>('/tenant/registers') });
  const saveStore = useMutation({
    mutationFn: () => api.patch('/tenant/store', storeForm),
    onSuccess: () => { toast.success('Datos de tienda actualizados.'); void qc.invalidateQueries({ queryKey: ['tenant-access'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const createBranch = useMutation({
    mutationFn: () => api.post('/tenant/branches', branchForm),
    onSuccess: () => { toast.success('Sucursal creada.'); setBranchOpen(false); void qc.invalidateQueries({ queryKey: ['tenant-access'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const createWarehouse = useMutation({
    mutationFn: () => api.post('/tenant/warehouses', warehouseForm),
    onSuccess: () => { toast.success('Bodega creada.'); setWarehouseOpen(false); void qc.invalidateQueries({ queryKey: ['warehouses'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const createRegister = useMutation({
    mutationFn: () => api.post('/tenant/registers', registerForm),
    onSuccess: () => { toast.success('Caja creada.'); setRegisterOpen(false); void qc.invalidateQueries({ queryKey: ['registers'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append('logo', file);
      await api.upload('/tenant/store/logo', form);
      toast.success('Logotipo actualizado.');
      void qc.invalidateQueries({ queryKey: ['tenant-access'] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };
  const syncPreferences = async (patch: Dict) => {
    try { await api.patch('/auth/preferences', patch); } catch { /* la preferencia local ya se aplicó */ }
  };

  return (
    <>
      <PageHeader title="Configuración de tienda" description="Información comercial, sucursales, bodegas, cajas y apariencia." />
      <div className="grid grid-2">
        <Card title="Información de la tienda" actions={<label className="btn sm ghost"><ImagePlus /> Logo<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label>}>
          <div className="flex items-center gap-2 mb-3">{tenant.data!.store.logoUrl ? <img src={tenant.data!.store.logoUrl} alt="" style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'contain', background: 'var(--surface-soft)' }} /> : <div className="avatar" style={{ width: 54, height: 54 }}><Store /></div>}<div><div className="strong">{tenant.data!.store.name}</div><div className="small muted">{tenant.data!.store.plan?.name} · {tenant.data!.store.businessType}</div></div></div>
          <div className="form-grid">
            <Field label="Nombre comercial"><input className="input" value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} /></Field>
            <Field label="Razón social"><input className="input" value={storeForm.legalName} onChange={(e) => setStoreForm({ ...storeForm, legalName: e.target.value })} /></Field>
            <Field label="Dirección" className="full"><input className="input" value={storeForm.address} onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })} /></Field>
            <Field label="Ciudad"><input className="input" value={storeForm.city} onChange={(e) => setStoreForm({ ...storeForm, city: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={storeForm.phone} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })} /></Field>
          </div>
          <div className="alert info mt-2"><ShieldCheck /><p>El correo, la identificación tributaria y el propietario requieren corrección administrativa con verificación adicional.</p></div>
          <div className="form-actions"><button className="btn primary" onClick={() => saveStore.mutate()} disabled={saveStore.isPending}>Guardar</button></div>
        </Card>
        <Card title="Apariencia y accesibilidad" subtitle="Se guarda en este equipo y en su preferencia de usuario.">
          <Field label="Tema"><div className="choice-row">{(['light', 'dark', 'system'] as const).map((mode) => <button key={mode} className={`choice ${theme.theme === mode ? 'active' : ''}`} onClick={() => { theme.setMode(mode); void syncPreferences({ theme: mode }); }}>{mode === 'light' ? 'Claro' : mode === 'dark' ? 'Oscuro' : 'Sistema'}</button>)}</div></Field>
          <Field label="Color de acento"><div className="swatches">{ACCENTS.map((accent) => <button key={accent.value} className={`swatch ${theme.accent === accent.value ? 'active' : ''}`} style={{ background: accent.color }} title={accent.label} onClick={() => { theme.setAccent(accent.value); void syncPreferences({ accent: accent.value }); }} />)}</div></Field>
          <div className="toggle"><div><div className="label">Reducir transparencia</div><div className="hint">Superficies sólidas para mayor legibilidad.</div></div><button className={`switch ${theme.reducedTransparency ? 'on' : ''}`} onClick={() => { const value = !theme.reducedTransparency; theme.setReducedTransparency(value); void syncPreferences({ reducedTransparency: value }); }} /></div>
          <div className="toggle"><div><div className="label">Reducir movimiento</div><div className="hint">Desactiva transiciones decorativas.</div></div><button className={`switch ${theme.reducedMotion ? 'on' : ''}`} onClick={() => { const value = !theme.reducedMotion; theme.setReducedMotion(value); void syncPreferences({ reducedMotion: value }); }} /></div>
          <div className="alert info mt-2"><Settings2 /><p>El POS prioriza velocidad: las transparencias se limitan a superficies pequeñas y existe fondo sólido de respaldo.</p></div>
        </Card>
      </div>
      <Card title="Sucursales" className="mt-3" actions={<button className="btn sm ghost" onClick={() => setBranchOpen(true)}><Plus /> Sucursal</button>}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Nombre</th><th>Código</th><th>Ciudad</th><th>Estado</th></tr></thead><tbody>{tenant.data!.branches.map((b) => <tr key={b.id}><td>{b.name}</td><td className="mono">{b.code}</td><td>{b.city}</td><td><span className="badge success">Activa</span></td></tr>)}</tbody></table></div>
      </Card>
      <div className="grid grid-2 mt-3">
        <Card title="Bodegas" actions={<button className="btn sm ghost" onClick={() => setWarehouseOpen(true)}><Plus /></button>}>
          {warehouses.isLoading ? <Loading /> : <div className="list">{(warehouses.data ?? []).map((w) => <div className="list-row" key={w.id}><Warehouse /><div className="grow"><div>{w.name}</div><div className="meta">{w.branch?.name} · {w.code}</div></div></div>)}</div>}
        </Card>
        <Card title="Cajas" actions={<button className="btn sm ghost" onClick={() => setRegisterOpen(true)}><Plus /></button>}>
          {registers.isLoading ? <Loading /> : <div className="list">{(registers.data ?? []).map((r) => <div className="list-row" key={r.id}><Wallet /><div className="grow"><div>{r.name}</div><div className="meta">{r.branch?.name} · {r.code}</div></div></div>)}</div>}
        </Card>
      </div>
      <Modal open={branchOpen} title="Nueva sucursal" onClose={() => setBranchOpen(false)} footer={<><button className="btn ghost" onClick={() => setBranchOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => createBranch.mutate()}>Crear</button></>}>
        <div className="form-grid"><Field label="Nombre"><input className="input" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} /></Field><Field label="Código"><input className="input" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} /></Field><Field label="Dirección" className="full"><input className="input" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></Field><Field label="Ciudad"><input className="input" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} /></Field></div>
      </Modal>
      <Modal open={warehouseOpen} title="Nueva bodega" onClose={() => setWarehouseOpen(false)} footer={<><button className="btn ghost" onClick={() => setWarehouseOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => createWarehouse.mutate()}>Crear</button></>}>
        <div className="form-grid"><Field label="Sucursal"><select className="select" value={warehouseForm.branchId} onChange={(e) => setWarehouseForm({ ...warehouseForm, branchId: e.target.value })}>{tenant.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Nombre"><input className="input" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} /></Field><Field label="Código"><input className="input" value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} /></Field></div>
      </Modal>
      <Modal open={registerOpen} title="Nueva caja" onClose={() => setRegisterOpen(false)} footer={<><button className="btn ghost" onClick={() => setRegisterOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => createRegister.mutate()}>Crear</button></>}>
        <div className="form-grid"><Field label="Sucursal"><select className="select" value={registerForm.branchId} onChange={(e) => setRegisterForm({ ...registerForm, branchId: e.target.value })}>{tenant.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Nombre"><input className="input" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} /></Field><Field label="Código"><input className="input" value={registerForm.code} onChange={(e) => setRegisterForm({ ...registerForm, code: e.target.value })} /></Field></div>
      </Modal>
    </>
  );
}

export function IntegrationsPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<Dict>('/tenant/integrations') });
  const [fiscal, setFiscal] = useState({ provider: 'test', mode: 'TEST', providerName: '', apiKey: '', apiSecret: '', notes: '' });
  const [account, setAccount] = useState({ provider: 'test', accountRef: '', currency: 'COP', mode: 'TEST' });
  const saveFiscal = useMutation({
    mutationFn: () => api.put('/tenant/integrations/fiscal', { ...fiscal, providerName: fiscal.providerName || undefined, apiKey: fiscal.apiKey || undefined, apiSecret: fiscal.apiSecret || undefined }),
    onSuccess: () => { toast.success('Configuración fiscal guardada.'); void qc.invalidateQueries({ queryKey: ['integrations'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveAccount = useMutation({
    mutationFn: () => api.post('/tenant/integrations/payment-accounts', account),
    onSuccess: () => { toast.success('Cuenta de pago registrada.'); setAccount({ ...account, accountRef: '' }); void qc.invalidateQueries({ queryKey: ['integrations'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data!;
  return (
    <>
      <PageHeader title="Integraciones" description="Pagos y facturación electrónica desacoplados. Sin credenciales productivas se opera en modo prueba." />
      <div className="grid grid-2">
        <Card title="Facturación electrónica" subtitle="Adaptador por empresa, estados y errores.">
          <dl className="kv"><dt>Proveedor</dt><dd>{data.fiscal.provider}</dd><dt>Modo</dt><dd><span className={`badge ${data.fiscal.mode === 'TEST' ? 'warning' : 'danger'}`}>{data.fiscal.mode}</span></dd><dt>Estado</dt><dd>{data.fiscal.status}</dd></dl>
          <div className="alert warning mt-2"><ShieldCheck /><p>{data.fiscal.dian}</p></div>
          <div className="form-grid mt-2">
            <Field label="Proveedor"><select className="select" value={fiscal.provider} onChange={(e) => setFiscal({ ...fiscal, provider: e.target.value })}><option value="test">Adaptador de pruebas</option><option value="provider">Proveedor autorizado</option></select></Field>
            <Field label="Modo"><select className="select" value={fiscal.mode} onChange={(e) => setFiscal({ ...fiscal, mode: e.target.value })}><option value="TEST">Prueba</option><option value="PRODUCTION">Producción</option></select></Field>
            <Field label="Nombre del proveedor" className="full"><input className="input" value={fiscal.providerName} onChange={(e) => setFiscal({ ...fiscal, providerName: e.target.value })} placeholder="Solo si aplica" /></Field>
            <Field label="API Key" className="full" hint="Se cifra en el servidor. No se muestra nuevamente."><input className="input" type="password" value={fiscal.apiKey} onChange={(e) => setFiscal({ ...fiscal, apiKey: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><button className="btn primary" onClick={() => saveFiscal.mutate()} disabled={saveFiscal.isPending}>Guardar configuración</button></div>
        </Card>
        <Card title="Cuentas de pago por tienda" subtitle="Eventos firmados y conciliación en servidor.">
          <dl className="kv"><dt>Proveedor</dt><dd>{data.payments.provider}</dd><dt>Modo</dt><dd>{data.payments.mode}</dd><dt>Webhook</dt><dd>{data.payments.webhookConfigured ? 'Configurado' : 'Pendiente de configurar'}</dd></dl>
          <div className="form-grid mt-2">
            <Field label="Proveedor"><input className="input" value={account.provider} onChange={(e) => setAccount({ ...account, provider: e.target.value })} /></Field>
            <Field label="Referencia de cuenta"><input className="input" value={account.accountRef} onChange={(e) => setAccount({ ...account, accountRef: e.target.value })} /></Field>
            <Field label="Moneda"><input className="input" value={account.currency} onChange={(e) => setAccount({ ...account, currency: e.target.value })} /></Field>
            <Field label="Modo"><select className="select" value={account.mode} onChange={(e) => setAccount({ ...account, mode: e.target.value })}><option value="TEST">Prueba</option><option value="PRODUCTION">Producción</option></select></Field>
          </div>
          <div className="form-actions"><button className="btn ghost" onClick={() => saveAccount.mutate()} disabled={saveAccount.isPending}>Agregar cuenta</button></div>
          <div className="list mt-2">{data.accounts.map((a: Dict) => <div className="list-row" key={a.id}><div className="grow"><div>{a.provider} · {a.accountRef}</div><div className="meta">{a.currency} · {a.mode}</div></div><span className={`badge ${a.active ? 'success' : 'danger'}`}>{a.active ? 'Activa' : 'Inactiva'}</span></div>)}</div>
        </Card>
      </div>
      <Card title="Documentos fiscales" className="mt-3">
        <div className="alert info"><ShieldCheck /><p>Los documentos de prueba no contienen CUFE real ni constituyen una factura electrónica validada por la DIAN. El envío productivo está bloqueado hasta configurar credenciales y adaptador certificado.</p></div>
      </Card>
    </>
  );
}

export function ProfilePage() {
  const { me, refresh } = useAuth();
  const [fullName, setFullName] = useState(me?.user.fullName ?? '');
  const [phone, setPhone] = useState(me?.user.phone ?? '');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [sessions, setSessions] = useState<Dict[]>([]);
  const [busy, setBusy] = useState(false);
  const loadSessions = async () => { try { setSessions(await api.get<Dict[]>('/auth/sessions')); } catch { /* silencioso */ } };
  useEffect(() => { void loadSessions(); }, []);
  const saveProfile = async () => {
    setBusy(true);
    try { await api.patch('/auth/profile', { fullName, phone }); await refresh(); toast.success('Perfil actualizado.'); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const saveUsername = async () => {
    setBusy(true);
    try { await api.post('/auth/change-username', { currentPassword, username }); setCurrentPassword(''); setUsername(''); await refresh(); toast.success('Usuario actualizado.'); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { await api.del(`/auth/sessions/${id}`); await loadSessions(); toast.success('Sesión revocada.'); } catch (error) { toast.error((error as Error).message); } };
  if (!me) return <Loading />;
  return (
    <>
      <PageHeader title="Mi perfil" description="Identidad, sesiones y seguridad de la cuenta." />
      <div className="grid grid-2">
        <Card title="Datos personales">
          <div className="form-grid">
            <Field label="Nombre"><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Teléfono"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Usuario actual"><input className="input" value={me.user.username} disabled /></Field>
            <Field label="Correo"><input className="input" value={me.user.email ?? ''} disabled /></Field>
          </div>
          <div className="alert info mt-2"><ShieldCheck /><p>El cambio de correo de recuperación requiere verificación adicional con soporte; no basta una solicitud anónima.</p></div>
          <div className="form-actions"><button className="btn primary" onClick={saveProfile} disabled={busy}>Guardar perfil</button><a className="btn ghost" href="#/change-password"><KeyRound /> Cambiar contraseña</a></div>
        </Card>
        <Card title="Cambiar nombre de usuario">
          <div className="flex-col gap-2">
            <Field label="Nuevo usuario"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label="Contraseña actual"><input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
            <button className="btn primary" onClick={saveUsername} disabled={busy || !username || !currentPassword}>Actualizar usuario</button>
          </div>
          <div className="alert warning mt-2"><KeyRound /><p>No se permiten nombres duplicados. El cambio queda auditado.</p></div>
        </Card>
      </div>
      <Card title="Sesiones activas" className="mt-3" actions={<button className="btn sm ghost" onClick={loadSessions}><RefreshCw /> Actualizar</button>}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Inicio</th><th>Último uso</th><th>Expira</th><th>Contexto</th><th /></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td className="small">{new Date(s.createdAt).toLocaleString('es-CO')}</td><td className="small">{new Date(s.lastUsedAt).toLocaleString('es-CO')}</td><td className="small">{new Date(s.expiresAt).toLocaleDateString('es-CO')}</td><td>{s.current ? <span className="badge success">Actual</span> : <span className="badge neutral">{s.tenantId ? 'Tienda' : 'Plataforma'}</span>}</td><td className="text-right">{!s.current && <button className="btn sm danger" onClick={() => revoke(s.id)}>Revocar</button>}</td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}
