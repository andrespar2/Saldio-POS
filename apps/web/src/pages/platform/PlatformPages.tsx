import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Gem,
  KeyRound,
  LifeBuoy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store as StoreIcon,
  Users,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES, MODULES, MODULE_LABELS } from '@saldio/shared';
import { api, ApiError, queryString } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';
import {
  Card,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Money,
  Pagination,
  PageHeader,
  StatusBadge,
} from '../../components/ui';

type Dict = Record<string, any>;

const PLATFORM_ROLE_LABELS: Record<string, string> = { SUPER_ADMIN: 'Superadministrador', ADMIN: 'Administrador', SUPPORT: 'Soporte' };

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }) {
  return (
    <div className="card stat">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {hint && <div className="stat-sub">{hint}</div>}
        </div>
        <div className="stat-icon" style={tone ? { background: `var(--${tone}-soft)`, color: `var(--${tone})` } : undefined}>
          <Activity size={17} />
        </div>
      </div>
    </div>
  );
}

export function PlatformDashboard() {
  const query = useQuery({ queryKey: ['platform-dashboard'], queryFn: () => api.get<Dict>('/platform/dashboard') });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data!;
  return (
    <>
      <PageHeader title="Administración de plataforma" description="Estado de las tiendas, planes y operación del servicio Saldio POS." />
      <div className="grid grid-4">
        <Stat label="Tiendas registradas" value={data.total} hint={`${data.counts.ACTIVE} activas`} />
        <Stat label="Pendientes" value={data.counts.PENDING} hint="Requieren revisión" tone="warning" />
        <Stat label="Suspendidas" value={data.counts.SUSPENDED} hint="Temporales o por revisión" tone="danger" />
        <Stat label="Ingreso mensual estimado" value={<Money value={data.mrr} />} hint="Según planes activos" tone="success" />
      </div>
      <div className="grid grid-2 mt-3">
        <Card title="Tiendas recientes" actions={<Link className="btn sm ghost" to="/admin/stores">Ver todas <ChevronRight /></Link>}>
          {data.recentStores.length === 0 ? <EmptyState title="Aún no hay tiendas" description="Las solicitudes de registro aparecerán aquí." /> : (
            <div className="list">
              {data.recentStores.map((store: Dict) => (
                <div className="list-row" key={store.id}>
                  <div className="avatar"><StoreIcon /></div>
                  <div className="grow">
                    <Link to={`/admin/stores/${store.id}`} className="strong">{store.name}</Link>
                    <div className="meta">{store.ownerName} · {BUSINESS_TYPE_LABELS[store.businessType as keyof typeof BUSINESS_TYPE_LABELS] ?? store.businessType}</div>
                  </div>
                  <StatusBadge status={store.status} />
                  <span className="tiny faint nowrap">{new Date(store.createdAt).toLocaleDateString('es-CO')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Operación" subtitle="Trabajos y correos pendientes">
          <div className="list">
            <div className="list-row"><Activity /><div className="grow"><div>Cola de trabajos</div><div className="meta">{data.jobs.pending} pendientes · {data.jobs.failed} fallidos</div></div><Link className="btn sm ghost" to="/admin/operations">Ver</Link></div>
            <div className="list-row"><ClipboardList /><div className="grow"><div>Correos pendientes</div><div className="meta">{data.emailPending} en bandeja de salida</div></div></div>
            <div className="list-row"><CheckCircle2 /><div className="grow"><div>Aprobación automática</div><div className="meta">{data.autoApproveStores ? 'Activa para nuevas tiendas' : 'Desactivada: revisión manual'}</div></div><Link className="btn sm ghost" to="/admin/settings">Configurar</Link></div>
          </div>
          <div className="alert info mt-3"><ShieldCheck /><p>El acceso de soporte es temporal, de solo lectura y queda auditado.</p></div>
        </Card>
      </div>
    </>
  );
}

export function PlatformStores() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['platform-stores', search, status, page],
    queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/platform/stores${queryString({ search, status, page, pageSize: 20 })}`),
  });
  return (
    <>
      <PageHeader title="Tiendas" description="Busque, revise y administre el ciclo de vida de cada empresa." actions={<Link className="btn primary" to="/register" target="_blank">Registrar tienda <Plus /></Link>} />
      <div className="toolbar">
        <div className="input-icon search"><Search /><input className="input" placeholder="Buscar por nombre, NIT, propietario, correo o teléfono" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="select" style={{ maxWidth: 210 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="ACTIVE">Activas</option>
          <option value="SUSPENDED">Suspendidas</option>
          <option value="DISABLED">Deshabilitadas</option>
        </select>
      </div>
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          {query.data!.items.length === 0 ? <EmptyState title="Sin resultados" description="Ajuste los filtros o registre una tienda." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tienda</th><th>Identificación</th><th>Propietario</th><th>Contacto</th><th>Plan</th><th>Estado</th><th className="num">Usuarios</th><th /></tr></thead>
                <tbody>
                  {query.data!.items.map((store) => (
                    <tr key={store.id}>
                      <td><Link to={`/admin/stores/${store.id}`}>{store.name}</Link><div className="tiny faint">{BUSINESS_TYPE_LABELS[store.businessType as keyof typeof BUSINESS_TYPE_LABELS]}</div></td>
                      <td className="mono small">{store.taxId ?? '—'}</td>
                      <td>{store.ownerName}</td>
                      <td className="small">{store.email}<div className="tiny faint">{store.phone}</div></td>
                      <td>{store.plan?.name ?? '—'}</td>
                      <td><StatusBadge status={store.status} /></td>
                      <td className="num">{store._count?.memberships ?? 0}</td>
                      <td className="text-right"><Link className="btn sm ghost" to={`/admin/stores/${store.id}`}>Abrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={query.data!.meta.page} pages={query.data!.meta.pages} total={query.data!.meta.total} onChange={setPage} />
        </Card>
      )}
    </>
  );
}

function StatusModal({ store, open, onClose, onDone }: { store: Dict; open: boolean; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DISABLED'>('SUSPENDED');
  const [reason, setReason] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post(`/platform/stores/${store.id}/status`, { status, reason, endsAt: endsAt || undefined }),
    onSuccess: () => { toast.success('Estado actualizado.'); onDone(); onClose(); },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <Modal open={open} title={`Cambiar estado de ${store.name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={mutation.isPending || reason.trim().length < 5} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Guardando…' : 'Confirmar cambio'}</button></>}>
      <div className="flex-col gap-3">
        <Field label="Nuevo estado">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ACTIVE">Activa / reactivar explícitamente</option>
            <option value="SUSPENDED">Suspensión temporal</option>
            <option value="DISABLED">Deshabilitación permanente</option>
          </select>
        </Field>
        <Field label="Motivo (obligatorio)" hint="Queda en el historial y la auditoría.">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {status === 'SUSPENDED' && <Field label="Finalización automática (opcional)"><input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>}
        {status !== 'ACTIVE' && <div className="alert warning"><AlertTriangle /><p>Se revocarán las sesiones de la tienda. No se borrarán ventas, documentos ni datos contables.</p></div>}
      </div>
    </Modal>
  );
}

export function PlatformStoreDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setSupportSession } = useAuth();
  const [tab, setTab] = useState('resumen');
  const [statusOpen, setStatusOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportReason, setSupportReason] = useState('');
  const [supportMinutes, setSupportMinutes] = useState(30);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [edit, setEdit] = useState<Dict | null>(null);
  const [confirmSector, setConfirmSector] = useState(false);
  const query = useQuery({ queryKey: ['platform-store', id], queryFn: () => api.get<Dict>(`/platform/stores/${id}`) });
  const plansQuery = useQuery({ queryKey: ['platform-plans'], queryFn: () => api.get<Dict>('/platform/plans') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['platform-store', id] }); void qc.invalidateQueries({ queryKey: ['platform-dashboard'] }); };
  const update = useMutation({
    mutationFn: (payload: Dict) => api.patch(`/platform/stores/${id}`, payload),
    onSuccess: () => { toast.success('Datos actualizados.'); setEdit(null); setConfirmSector(false); refresh(); },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === 'SECTOR_CHANGE_REQUIRES_CONFIRMATION') setConfirmSector(true);
      else toast.error((error as Error).message);
    },
  });
  const approve = useMutation({ mutationFn: () => api.post(`/platform/stores/${id}/approve`), onSuccess: () => { toast.success('Tienda activada.'); refresh(); } });
  const plan = useMutation({
    mutationFn: (payload: Dict) => api.post(`/platform/stores/${id}/plan`, payload),
    onSuccess: () => { toast.success('Plan actualizado.'); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const support = useMutation({
    mutationFn: () => api.post<Dict>(`/platform/stores/${id}/support-sessions`, { reason: supportReason, minutes: supportMinutes }),
    onSuccess: async (data) => {
      await setSupportSession(data.tokens);
      toast.success('Sesión de soporte iniciada. Es de solo lectura.');
      navigate('/app');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const resetPassword = useMutation({
    mutationFn: (userId: string) => api.post<{ temporaryPassword: string }>(`/platform/users/${userId}/reset-password`, { reason: 'Soporte administrativo' }),
    onSuccess: (data) => setTempPassword(data.temporaryPassword),
    onError: (error) => toast.error((error as Error).message),
  });

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data!;
  const store = data.store as Dict;
  const tenant = data.tenant as Dict;

  const startEdit = () => setEdit({
    name: store.name, legalName: store.legalName ?? '', taxType: store.taxType ?? '', taxId: store.taxId ?? '',
    ownerName: store.ownerName, email: store.email, phone: store.phone, address: store.address,
    city: store.city, businessType: store.businessType, reason: 'Corrección administrativa',
  });

  const selectedPlan = plansQuery.data?.plans?.find((p: Dict) => p.id === store.planId);

  return (
    <>
      <div className="mb-2"><Link className="btn sm ghost" to="/admin/stores"><ArrowLeft /> Tiendas</Link></div>
      <PageHeader
        title={store.name}
        description={`${BUSINESS_TYPE_LABELS[store.businessType as keyof typeof BUSINESS_TYPE_LABELS]} · ${store.city} · ${store.email}`}
        actions={<><StatusBadge status={store.status} />{store.status === 'PENDING' && <button className="btn success" onClick={() => approve.mutate()} disabled={approve.isPending}><CheckCircle2 /> Aprobar</button>}<button className="btn ghost" onClick={() => setStatusOpen(true)}>Cambiar estado</button><button className="btn primary" onClick={() => setSupportOpen(true)}><LifeBuoy /> Soporte</button></>}
      />
      <div className="tabs">
        {['resumen', 'comercial', 'plan', 'usuarios', 'historial'].map((value) => (
          <button key={value} className={`tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value)}>{value === 'resumen' ? 'Resumen' : value === 'comercial' ? 'Datos comerciales' : value === 'plan' ? 'Plan y módulos' : value === 'usuarios' ? 'Usuarios' : 'Historial'}</button>
        ))}
      </div>
      {tab === 'resumen' && (
        <div className="grid grid-2">
          <Card title="Operación" subtitle="Datos actuales de la tienda">
            <div className="grid grid-2">
              <Stat label="Ventas históricas" value={tenant.salesCount} hint={<Money value={tenant.salesTotal} />} />
              <Stat label="Productos" value={tenant.products} hint="Catálogo actual" />
              <Stat label="Cajas abiertas" value={tenant.openCash} />
              <Stat label="Pedidos abiertos" value={tenant.openOrders} />
            </div>
            <div className="alert info mt-3"><ShieldCheck /><p>Los comprobantes emitidos conservan su propia instantánea; editar la tienda no reescribe el historial.</p></div>
          </Card>
          <Card title="Ficha" actions={<button className="btn sm ghost" onClick={startEdit}><Pencil /> Editar</button>}>
            <dl className="kv">
              <dt>Identificación</dt><dd>{store.taxType} {store.taxId ?? '—'}</dd>
              <dt>Razón social</dt><dd>{store.legalName ?? '—'}</dd>
              <dt>Propietario</dt><dd>{store.ownerName}</dd>
              <dt>Teléfono</dt><dd>{store.phone}</dd>
              <dt>Dirección</dt><dd>{store.address}, {store.city}</dd>
              <dt>Plan</dt><dd>{store.plan?.name ?? 'Sin plan'}</dd>
              <dt>Creada</dt><dd>{new Date(store.createdAt).toLocaleString('es-CO')}</dd>
              <dt>Aprobada</dt><dd>{store.approvedAt ? new Date(store.approvedAt).toLocaleString('es-CO') : '—'}</dd>
              {store.suspensionEndsAt && <><dt>Suspensión hasta</dt><dd>{new Date(store.suspensionEndsAt).toLocaleString('es-CO')}</dd></>}
            </dl>
          </Card>
          <Card title="Últimas ventas" className="grid-span-2">
            {tenant.lastSales.length === 0 ? <EmptyState title="Sin ventas todavía" /> : (
              <div className="table-wrap"><table className="table compact"><thead><tr><th>Comprobante</th><th>Fecha</th><th>Estado</th><th className="num">Total</th></tr></thead><tbody>{tenant.lastSales.map((sale: Dict) => <tr key={sale.id}><td className="mono">{sale.number}</td><td>{new Date(sale.createdAt).toLocaleString('es-CO')}</td><td><StatusBadge status={sale.status} /></td><td className="num"><Money value={sale.total} /></td></tr>)}</tbody></table></div>
            )}
          </Card>
        </div>
      )}
      {tab === 'comercial' && edit && (
        <Card title="Corrección de información comercial" subtitle="Los cambios quedan auditados y no alteran comprobantes históricos.">
          <div className="form-grid">
            {(['name', 'legalName', 'taxType', 'taxId', 'ownerName', 'email', 'phone', 'address', 'city'] as const).map((field) => (
              <Field key={field} label={field === 'name' ? 'Nombre comercial' : field === 'legalName' ? 'Razón social' : field === 'taxType' ? 'Tipo ID' : field === 'taxId' ? 'Número ID' : field === 'ownerName' ? 'Propietario' : field === 'email' ? 'Correo' : field === 'phone' ? 'Teléfono' : field === 'address' ? 'Dirección' : 'Ciudad'}>
                <input className="input" value={edit[field] ?? ''} onChange={(e) => setEdit({ ...edit, [field]: e.target.value })} />
              </Field>
            ))}
            <Field label="Tipo de negocio" hint="Un cambio incompatible exige confirmación expresa.">
              <select className="select" value={edit.businessType} onChange={(e) => setEdit({ ...edit, businessType: e.target.value })}>
                {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{BUSINESS_TYPE_LABELS[type]}</option>)}
              </select>
            </Field>
            <Field label="Motivo" className="full"><input className="input" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
          </div>
          {confirmSector && <div className="alert warning mt-2"><AlertTriangle /><div><p>El cambio de sector ocultará funciones con datos existentes. No se borrarán datos. Confirme para continuar.</p><button className="btn sm danger mt-2" onClick={() => update.mutate({ ...edit, confirmIncompatible: true })}>Confirmar cambio de sector</button></div></div>}
          <div className="form-actions"><button className="btn ghost" onClick={() => { setEdit(null); setConfirmSector(false); }}>Cancelar</button><button className="btn primary" onClick={() => update.mutate(edit)} disabled={update.isPending}>Guardar cambios</button></div>
        </Card>
      )}
      {tab === 'comercial' && !edit && <Card><EmptyState title="Edición cerrada" description="Pulse Editar en la ficha para corregir los datos comerciales." action={<button className="btn primary" onClick={startEdit}><Pencil /> Editar datos</button>} /></Card>}
      {tab === 'plan' && (
        <Card title="Plan, módulos y límites" subtitle="El acceso efectivo combina estado, sector, plan, módulo y permisos.">
          <div className="form-grid">
            <Field label="Plan">
              <select className="select" value={store.planId ?? ''} onChange={(e) => plan.mutate({ planId: e.target.value, enabledModules: selectedPlan?.modules ?? [] })}>
                <option value="">Seleccione</option>
                {(plansQuery.data?.plans ?? []).map((p: Dict) => <option key={p.id} value={p.id}>{p.name} · {Number(p.price).toLocaleString('es-CO')} {p.currency}</option>)}
              </select>
            </Field>
            <Field label="Límites del plan"><div className="code-chip">{JSON.stringify(store.limits)}</div></Field>
            <div className="full"><div className="label mb-1">Módulos del plan</div><div className="flex wrap gap-1">{selectedPlan?.modules?.map((m: string) => <span className="badge accent" key={m}>{MODULE_LABELS[m as keyof typeof MODULE_LABELS] ?? m}</span>)}</div></div>
            <div className="full"><div className="label mb-1">Complementos habilitados</div><div className="flex wrap gap-1">{(store.enabledModules ?? []).length ? store.enabledModules.map((m: string) => <span className="badge info" key={m}>{MODULE_LABELS[m as keyof typeof MODULE_LABELS] ?? m}</span>) : <span className="muted small">Ninguno</span>}</div></div>
          </div>
          <div className="alert warning mt-3"><AlertTriangle /><p>Cambiar de plan no elimina datos. Si el nuevo plan no incluye un módulo, solo se restringe el acceso.</p></div>
        </Card>
      )}
      {tab === 'usuarios' && (
        <Card title="Usuarios vinculados">
          <div className="table-wrap"><table className="table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th /></tr></thead><tbody>
            {store.memberships.map((membership: Dict) => (
              <tr key={membership.id}>
                <td className="mono">{membership.user.username}<div className="tiny faint">{membership.user.email ?? 'Sin correo'}</div></td>
                <td>{membership.user.fullName}</td>
                <td><span className="badge neutral">{membership.role}</span></td>
                <td>{membership.user.status === 'ACTIVE' ? <span className="badge success">Activo</span> : <span className="badge danger">Deshabilitado</span>}</td>
                <td className="small">{membership.user.lastLoginAt ? new Date(membership.user.lastLoginAt).toLocaleString('es-CO') : 'Nunca'}</td>
                <td className="text-right"><button className="btn sm ghost" onClick={() => resetPassword.mutate(membership.user.id)}><KeyRound /> Temporal</button></td>
              </tr>
            ))}
          </tbody></table></div>
          <p className="inline-note mt-2">Las contraseñas actuales no son visibles. El restablecimiento genera una clave temporal de un solo uso.</p>
        </Card>
      )}
      {tab === 'historial' && (
        <div className="grid grid-2">
          <Card title="Estados">
            <div className="list">{data.statusHistory.map((h: Dict) => <div className="list-row" key={h.id}><StatusBadge status={h.to} /><div className="grow"><div>{h.reason}</div><div className="meta">{new Date(h.createdAt).toLocaleString('es-CO')} · {h.from} → {h.to}</div></div></div>)}</div>
          </Card>
          <Card title="Auditoría administrativa">
            <div className="list">{data.audit.map((a: Dict) => <div className="list-row" key={a.id}><div className="avatar">{a.action.slice(0, 2)}</div><div className="grow"><div className="small strong">{a.action}</div><div className="meta">{a.actor?.username ?? 'Sistema'} · {new Date(a.createdAt).toLocaleString('es-CO')}</div>{a.reason && <div className="tiny faint">{a.reason}</div>}</div></div>)}</div>
          </Card>
        </div>
      )}
      <StatusModal store={store} open={statusOpen} onClose={() => setStatusOpen(false)} onDone={refresh} />
      <Modal open={supportOpen} title="Sesión de soporte" onClose={() => setSupportOpen(false)} footer={<><button className="btn ghost" onClick={() => setSupportOpen(false)}>Cancelar</button><button className="btn primary" disabled={supportReason.trim().length < 5 || support.isPending} onClick={() => support.mutate()}>Abrir solo lectura</button></>}>
        <div className="alert warning"><LifeBuoy /><p>La sesión es temporal, visible para la tienda y de solo lectura. No permite conocer contraseñas ni modificar documentos confirmados.</p></div>
        <Field label="Motivo" hint="Obligatorio y auditado."><textarea className="textarea mt-2" value={supportReason} onChange={(e) => setSupportReason(e.target.value)} /></Field>
        <Field label="Duración (minutos)"><input className="input" type="number" min={5} max={120} value={supportMinutes} onChange={(e) => setSupportMinutes(Number(e.target.value))} /></Field>
      </Modal>
      <Modal open={Boolean(tempPassword)} title="Contraseña temporal" onClose={() => setTempPassword(null)} footer={<button className="btn primary" onClick={() => setTempPassword(null)}>Entendido</button>}>
        <div className="alert warning"><KeyRound /><p>Se muestra una sola vez. El usuario deberá cambiarla al iniciar sesión y sus sesiones previas fueron revocadas.</p></div>
        <div className="flex gap-2 mt-3"><input className="input mono" readOnly value={tempPassword ?? ''} /><button className="btn ghost" onClick={() => { void navigator.clipboard.writeText(tempPassword ?? ''); toast.success('Copiada.'); }}><Copy /></button></div>
      </Modal>
    </>
  );
}

export function PlatformAdmins() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '', role: 'ADMIN' });
  const query = useQuery({ queryKey: ['platform-admins'], queryFn: () => api.get<Dict[]>('/platform/admins') });
  const create = useMutation({
    mutationFn: () => api.post('/platform/admins', form),
    onSuccess: () => { toast.success('Administrador creado.'); setCreateOpen(false); setForm({ fullName: '', username: '', email: '', password: '', role: 'ADMIN' }); void qc.invalidateQueries({ queryKey: ['platform-admins'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Dict }) => api.patch(`/platform/admins/${id}`, payload),
    onSuccess: () => { toast.success('Administrador actualizado.'); void qc.invalidateQueries({ queryKey: ['platform-admins'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const reset = useMutation({
    mutationFn: (id: string) => api.post<{ temporaryPassword: string }>(`/platform/admins/${id}/reset-password`, { reason: 'Recuperación administrativa' }),
    onSuccess: (data) => setTemp(data.temporaryPassword),
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <>
      <PageHeader title="Administradores de plataforma" description="Cree, asigne permisos y desactive cuentas. El último superadministrador activo no puede eliminarse." actions={<button className="btn primary" onClick={() => setCreateOpen(true)}><Plus /> Nuevo administrador</button>} />
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          <div className="table-wrap"><table className="table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acceso</th><th /></tr></thead><tbody>
            {query.data!.map((admin) => (
              <tr key={admin.id}>
                <td className="mono">{admin.username}<div className="tiny faint">{admin.email}</div></td>
                <td>{admin.fullName}</td>
                <td><span className="badge neutral">{PLATFORM_ROLE_LABELS[admin.platformRole] ?? admin.platformRole}</span></td>
                <td>{admin.status === 'ACTIVE' ? <span className="badge success">Activo</span> : <span className="badge danger">Deshabilitado</span>}</td>
                <td className="small">{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString('es-CO') : 'Nunca'}{admin.mustChangePassword && <div className="tiny warning-text">Cambio pendiente</div>}</td>
                <td className="text-right">
                  <button className="btn sm ghost" onClick={() => reset.mutate(admin.id)}><KeyRound /></button>
                  <button className="btn sm ghost" onClick={() => update.mutate({ id: admin.id, payload: { status: admin.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', reason: 'Cambio administrativo' } })}>{admin.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        </Card>
      )}
      <Modal open={createOpen} title="Nuevo administrador" onClose={() => setCreateOpen(false)} footer={<><button className="btn ghost" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}>Crear</button></>}>
        <div className="form-grid">
          <Field label="Nombre completo"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Usuario"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Correo"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Rol"><select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="SUPER_ADMIN">Superadministrador</option><option value="ADMIN">Administrador</option><option value="SUPPORT">Soporte</option></select></Field>
          <Field label="Contraseña inicial" hint="Se exigirá cambio en el primer acceso." className="full"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={Boolean(temp)} title="Contraseña temporal" onClose={() => setTemp(null)} footer={<button className="btn primary" onClick={() => setTemp(null)}>Entendido</button>}>
        <div className="alert warning"><KeyRound /><p>Visible una sola vez. No se almacena en claro.</p></div>
        <div className="flex gap-2 mt-3"><input className="input mono" readOnly value={temp ?? ''} /><button className="btn ghost" onClick={() => { void navigator.clipboard.writeText(temp ?? ''); toast.success('Copiada.'); }}><Copy /></button></div>
      </Modal>
    </>
  );
}

export function PlatformPlans() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Dict | null>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['platform-plans'], queryFn: () => api.get<Dict>('/platform/plans') });
  const save = useMutation({
    mutationFn: () => editing?.id ? api.patch(`/platform/plans/${editing.id}`, editing) : api.post('/platform/plans', editing),
    onSuccess: () => { toast.success('Plan guardado.'); setOpen(false); setEditing(null); void qc.invalidateQueries({ queryKey: ['platform-plans'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const blank = { code: '', name: '', description: '', price: '0', modules: ['CORE', 'POS', 'CASH'], limits: { users: 3, branches: 1, products: 1000 }, status: 'ACTIVE' };
  return (
    <>
      <PageHeader title="Planes y complementos" description="Los cambios de plan se versionan y quedan auditados." actions={<button className="btn primary" onClick={() => { setEditing(blank); setOpen(true); }}><Plus /> Nuevo plan</button>} />
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <div className="grid grid-2">
          <Card title="Planes">
            <div className="list">
              {query.data!.plans.map((plan: Dict) => (
                <div className="list-row" key={plan.id}>
                  <div className="avatar"><Gem /></div>
                  <div className="grow"><div className="strong">{plan.name} <span className="badge neutral">{plan.code}</span></div><div className="meta">{plan.modules.length} módulos · v{plan.version} · <Money value={plan.price} currency={plan.currency} /></div><div className="tiny faint">{plan.description}</div></div>
                  <StatusBadge status={plan.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED'} />
                  <button className="btn sm ghost" onClick={() => { setEditing(plan); setOpen(true); }}><Pencil /></button>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Complementos">
            <div className="list">{query.data!.addons.map((addon: Dict) => <div className="list-row" key={addon.id}><div className="avatar"><Plus /></div><div className="grow"><div className="strong">{addon.name}</div><div className="meta">{MODULE_LABELS[addon.module as keyof typeof MODULE_LABELS] ?? addon.module} · <Money value={addon.price} /></div></div></div>)}</div>
          </Card>
        </div>
      )}
      <Modal open={open} title={editing?.id ? 'Editar plan' : 'Nuevo plan'} onClose={() => setOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Guardar</button></>}>
        {editing && (
          <div className="flex-col gap-3">
            <div className="form-grid">
              <Field label="Código"><input className="input" value={editing.code} disabled={Boolean(editing.id)} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Nombre"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Precio mensual"><input className="input" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></Field>
              <Field label="Estado"><select className="select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}><option value="ACTIVE">Activo</option><option value="ARCHIVED">Archivado</option></select></Field>
              <Field label="Descripción" className="full"><input className="input" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            </div>
            <div><div className="label mb-1">Módulos</div><div className="flex wrap gap-1">{MODULES.map((module) => <label className="checkbox" key={module} style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 8 }}><input type="checkbox" checked={editing.modules.includes(module)} onChange={(e) => setEditing({ ...editing, modules: e.target.checked ? [...editing.modules, module] : editing.modules.filter((m: string) => m !== module) })} />{MODULE_LABELS[module]}</label>)}</div></div>
            <div className="alert info"><ShieldCheck /><p>Los límites se aplican en el servidor. Las integraciones fiscales y de pagos requieren credenciales productivas separadas.</p></div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function PlatformAudit() {
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['platform-audit', tenantId, action, page], queryFn: () => api.get<Dict>(`/platform/audit${queryString({ tenantId, action, page, pageSize: 30 })}`) });
  return (
    <>
      <PageHeader title="Auditoría" description="Acciones administrativas, cambios de estado y recuperaciones de cuentas." />
      <div className="toolbar"><input className="input" placeholder="ID de tienda" value={tenantId} onChange={(e) => { setTenantId(e.target.value); setPage(1); }} style={{ maxWidth: 340 }} /><input className="input" placeholder="Acción" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ maxWidth: 240 }} /></div>
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Objeto</th><th>Motivo</th></tr></thead><tbody>
            {query.data!.items.map((item: Dict) => <tr key={item.id}><td className="small">{new Date(item.createdAt).toLocaleString('es-CO')}</td><td>{item.actor?.username ?? 'Sistema'}</td><td><span className="badge accent">{item.action}</span></td><td className="small">{item.targetType} {item.targetId ? <span className="mono tiny">{item.targetId.slice(0, 8)}</span> : null}</td><td className="small">{item.reason ?? '—'}</td></tr>)}
          </tbody></table></div>
          <Pagination page={query.data!.meta.page} pages={query.data!.meta.pages} total={query.data!.meta.total} onChange={setPage} />
        </Card>
      )}
    </>
  );
}

export function PlatformOperations() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['platform-operations'], queryFn: () => api.get<Dict>('/platform/operations'), refetchInterval: 15000 });
  const retry = useMutation({ mutationFn: (id: string) => api.post(`/platform/jobs/${id}/retry`), onSuccess: () => { toast.success('Trabajo reencolado.'); void qc.invalidateQueries({ queryKey: ['platform-operations'] }); } });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data!;
  return (
    <>
      <PageHeader title="Servicio y trabajos" description="Estado del backend, cola de trabajos e integraciones. No se muestran secretos." actions={<button className="btn ghost" onClick={() => void query.refetch()}><RefreshCw /> Actualizar</button>} />
      <div className="grid grid-4">
        <Stat label="Base de datos" value={`${data.service.databaseLatencyMs} ms`} hint="Latencia de consulta" tone="success" />
        <Stat label="Disponibilidad" value={`${Math.floor(data.service.uptimeSeconds / 60)} min`} hint={`v${data.service.version}`} />
        <Stat label="Trabajos fallidos" value={data.jobs.failed} hint={`${data.jobs.pending} pendientes`} tone="danger" />
        <Stat label="Sesiones activas" value={data.activeSessions} hint={`${data.pendingEmails} correos pendientes`} />
      </div>
      <div className="grid grid-2 mt-3">
        <Card title="Integraciones" subtitle="Estado declarado, sin simular producción">
          <dl className="kv">
            <dt>Pagos</dt><dd>{data.integrations.payments.provider} · {data.integrations.payments.mode} · {data.integrations.payments.configured ? 'webhook configurado' : 'pendiente de configurar'}</dd>
            <dt>Facturación electrónica</dt><dd>{data.integrations.fiscal.provider} · {data.integrations.fiscal.mode} · {data.integrations.fiscal.configured ? 'configurada' : 'no configurada'}</dd>
          </dl>
          <div className="alert warning mt-2"><AlertTriangle /><p>Sin credenciales productivas verificadas no se declara cumplimiento fiscal ni cobros reales.</p></div>
        </Card>
        <Card title="Trabajos fallidos">
          {data.failedJobs.length === 0 ? <EmptyState title="Sin trabajos fallidos" /> : <div className="list">{data.failedJobs.map((job: Dict) => <div className="list-row" key={job.id}><XCircle className="danger-text" /><div className="grow"><div className="small strong">{job.type}</div><div className="meta">{job.lastError}</div></div><button className="btn sm ghost" onClick={() => retry.mutate(job.id)}>Reintentar</button></div>)}</div>}
        </Card>
        <Card title="Errores de integración" className="grid-span-2">
          {data.integrationLogs.length === 0 ? <EmptyState title="Sin eventos" /> : <div className="table-wrap"><table className="table compact"><thead><tr><th>Fecha</th><th>Integración</th><th>Estado</th><th>Mensaje</th></tr></thead><tbody>{data.integrationLogs.map((log: Dict) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString('es-CO')}</td><td>{log.kind} / {log.provider}</td><td><StatusBadge status={log.status === 'reconciled' ? 'ACTIVE' : log.status === 'SIGNATURE_INVALID' ? 'ERROR' : 'PENDING'} /></td><td className="small">{log.message}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>
    </>
  );
}

export function PlatformSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['platform-settings'], queryFn: () => api.get<Dict>('/platform/settings') });
  const [form, setForm] = useState<Dict | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch('/platform/settings', form),
    onSuccess: () => { toast.success('Configuración guardada.'); void qc.invalidateQueries({ queryKey: ['platform-settings'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const current = form ?? query.data!;
  return (
    <>
      <PageHeader title="Configuración de plataforma" description="Aprobación de tiendas, contacto de soporte y avisos." />
      <Card title="Registro de tiendas">
        <div className="toggle"><div><div className="label">Aprobación automática</div><div className="hint">Si está activa, las nuevas tiendas quedan operativas al registrarse.</div></div><button className={`switch ${current.autoApproveStores ? 'on' : ''}`} onClick={() => setForm({ ...current, autoApproveStores: !current.autoApproveStores })} aria-label="Alternar aprobación automática" /></div>
        <div className="form-grid mt-3">
          <Field label="Correo de soporte"><input className="input" value={current.supportEmail ?? ''} onChange={(e) => setForm({ ...current, supportEmail: e.target.value })} /></Field>
          <Field label="Aviso público"><input className="input" value={current.publicNotice ?? ''} onChange={(e) => setForm({ ...current, publicNotice: e.target.value })} /></Field>
        </div>
        <div className="form-actions"><button className="btn primary" onClick={() => save.mutate()} disabled={!form || save.isPending}>Guardar configuración</button></div>
      </Card>
      <Card title="Recordatorios operativos" className="mt-3">
        <div className="alert warning"><AlertTriangle /><p>El backend central requiere un despliegue operado con HTTPS, respaldos y monitoreo. El instalador Windows no incluye la base de datos ni secretos.</p></div>
      </Card>
    </>
  );
}
