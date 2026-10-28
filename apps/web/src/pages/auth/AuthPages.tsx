import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Server,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@saldio/shared';
import { api, apiBase, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { toast } from '../../lib/toast';
import { ErrorNotice, Field, Modal } from '../../components/ui';

function AuthBrand() {
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

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <AuthBrand />
        <div>
          <h2 className="auth-headline">
            Tu negocio, <span>en orden</span> y sin fricción.
          </h2>
          <p className="muted mt-2" style={{ maxWidth: 560 }}>
            Ventas rápidas, inventario confiable, caja cuadrada y decisiones con datos.
            Una plataforma multiempresa para operar con tranquilidad.
          </p>
          <div className="auth-points mt-4">
            <div className="auth-point"><strong>Punto de venta ágil</strong>Lector de código, atajos y pagos mixtos.</div>
            <div className="auth-point"><strong>Inventario real</strong>Movimientos trazables y stock por sucursal.</div>
            <div className="auth-point"><strong>Administración clara</strong>Roles, planes y auditoría por tienda.</div>
            <div className="auth-point"><strong>Comprobantes listos</strong>58 mm, 80 mm y A4 con reimpresión marcada.</div>
          </div>
        </div>
        <p className="tiny faint">Saldio POS no sustituye la validación fiscal de la DIAN.</p>
      </aside>
      <main className="auth-panel">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setMode } = useTheme();
  return (
    <div className="choice-row" style={{ justifyContent: 'flex-end', marginBottom: 14 }}>
      {(['light', 'dark', 'system'] as const).map((value) => (
        <button key={value} className={`choice ${theme === value ? 'active' : ''}`} onClick={() => setMode(value)}>
          {value === 'light' ? 'Claro' : value === 'dark' ? 'Oscuro' : 'Sistema'}
        </button>
      ))}
    </div>
  );
}

export function LoginPage() {
  const { login, me, selectTenant, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Array<{ tenantId: string; storeName: string; status: string; role: string }> | null>(null);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverValue, setServerValue] = useState(
    localStorage.getItem('saldio.apiUrl') ?? (import.meta.env.VITE_API_URL as string) ?? '',
  );

  useEffect(() => {
    if (!loading && me) {
      navigate(me.store ? '/app' : me.platform ? '/admin' : '/login', { replace: true });
    }
  }, [loading, me, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(username, password);
      if (result.requiresStoreSelection && result.memberships) {
        setSelection(result.memberships as unknown as typeof selection);
        return;
      }
      if (result.user?.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      navigate(result.store ? '/app' : result.platform ? '/admin' : '/login', { replace: true });
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError && caught.code === 'NETWORK_ERROR') {
        setServerOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const chooseStore = async (tenantId: string) => {
    setBusy(true);
    try {
      await selectTenant(tenantId);
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (selection) {
    return (
      <AuthLayout>
        <ThemeToggle />
        <h1>Seleccione una tienda</h1>
        <p className="lead">Su usuario pertenece a varias tiendas. Elija con cuál desea operar.</p>
        <div className="list">
          {selection.map((item) => (
            <button key={item.tenantId} className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => chooseStore(item.tenantId)} disabled={busy}>
              <span><Store size={16} /> {item.storeName}</span>
              <span className="badge neutral">{item.role}</span>
            </button>
          ))}
        </div>
        <ErrorNotice error={error} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <ThemeToggle />
      <h1>Bienvenido de nuevo</h1>
      <p className="lead">Ingrese con su usuario o correo. Los administradores de plataforma entran al panel administrativo.</p>
      <form onSubmit={submit} className="flex-col gap-3">
        <Field label="Usuario o correo">
          <div className="input-icon"><UserRound /><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus /></div>
        </Field>
        <Field label="Contraseña">
          <div className="input-icon"><LockKeyhole /><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></div>
        </Field>
        <ErrorNotice error={error} />
        <button className="btn primary lg block" disabled={busy}>
          {busy ? <Loader2 className="spinner" /> : <ArrowRight />} Entrar
        </button>
      </form>
      <div className="auth-alt">
        <Link to="/forgot-password">Olvidé mi contraseña</Link>
        <span className="faint"> · </span>
        <Link to="/register">Registrar mi tienda</Link>
      </div>
      <div className="auth-alt" style={{ marginTop: 22 }}>
        <button className="btn sm ghost" onClick={() => setServerOpen(true)}><Server size={14} /> Configurar servidor</button>
        <div className="tiny faint mt-1">{apiBase()}</div>
      </div>
      <Modal open={serverOpen} title="Servidor de Saldio POS" onClose={() => setServerOpen(false)} footer={<><button className="btn ghost" onClick={() => setServerOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => { localStorage.setItem('saldio.apiUrl', serverValue.replace(/\/+$/, '')); window.location.reload(); }}>Guardar y recargar</button></>}>
        <p className="small muted mb-2">Dirección HTTPS del backend. No ingrese aquí contraseñas ni claves de base de datos.</p>
        <Field label="URL del servidor" hint="Ejemplo: https://pos.midominio.com. El instalador no incluye secretos.">
          <input className="input" value={serverValue} onChange={(e) => setServerValue(e.target.value)} placeholder="https://api.midominio.com" />
        </Field>
      </Modal>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '', legalName: '', taxType: 'NIT', taxId: '', ownerName: '', username: '', email: '', phone: '',
    address: '', city: '', businessType: 'SUPERMARKET' as (typeof BUSINESS_TYPES)[number], password: '', confirmPassword: '',
    planCode: '', termsAccepted: false, dataAccepted: false,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const plansQuery = useQuery({ queryKey: ['public-plans'], queryFn: () => api.get<Array<{ code: string; name: string; price: string; description: string | null; modules: string[] }>>('/public/plans', { token: null }) });
  useEffect(() => {
    if (!form.planCode && plansQuery.data?.length) {
      const first = plansQuery.data[0];
      if (first) setForm((current) => ({ ...current, planCode: first.code }));
    }
  }, [plansQuery.data, form.planCode]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const canNext = step === 1
    ? form.name.trim().length >= 2 && form.ownerName.trim().length >= 3 && form.address.trim().length >= 5 && form.city.trim().length >= 2
    : form.username.trim().length >= 4 && form.email.includes('@') && form.phone.trim().length >= 7 && form.password.length >= 10 && form.password === form.confirmPassword;

  const submit = async () => {
    setError(null);
    if (!form.termsAccepted || !form.dataAccepted) {
      setError(new Error('Debe aceptar los términos y el tratamiento de datos.'));
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key === 'termsAccepted' || key === 'dataAccepted') data.append(key, String(value));
        else data.append(key, String(value));
      }
      if (logo) data.append('logo', logo);
      const response = await api.upload<{ status: string; message: string }>('/public/stores', data);
      setResult(response);
      toast.success('Solicitud de registro enviada.');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <AuthLayout>
        <div className="empty" style={{ padding: 0 }}>
          <div className="empty-icon"><Check /></div>
          <h1>{result.status === 'ACTIVE' ? 'Tienda activa' : 'Solicitud recibida'}</h1>
          <p className="lead">{result.message}</p>
          <Link className="btn primary" to="/login">Ir a iniciar sesión</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="auth-panel" style={{ alignItems: 'flex-start', paddingTop: 30 }}>
        <div className="auth-card register-card">
          <AuthBrand />
          <div className="auth-steps mt-3" aria-hidden="true">
            <span className={step >= 1 ? 'on' : ''} />
            <span className={step >= 2 ? 'on' : ''} />
            <span className={step >= 3 ? 'on' : ''} />
          </div>
          <h1>{step === 1 ? 'Registre su negocio' : step === 2 ? 'Datos de acceso' : 'Plan y confirmación'}</h1>
          <p className="lead">La tienda queda pendiente de aprobación salvo que la plataforma tenga activa la aprobación automática.</p>
          {step === 1 && (
            <div className="form-grid">
              <Field label="Nombre comercial"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
              <Field label="Razón social (opcional)"><input className="input" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
              <Field label="Tipo de negocio">
                <select className="select" value={form.businessType} onChange={(e) => set('businessType', e.target.value as typeof form.businessType)}>
                  {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{BUSINESS_TYPE_LABELS[type]}</option>)}
                </select>
              </Field>
              <Field label="Tipo de identificación"><input className="input" value={form.taxType} onChange={(e) => set('taxType', e.target.value)} /></Field>
              <Field label="Número de identificación"><input className="input" value={form.taxId} onChange={(e) => set('taxId', e.target.value)} /></Field>
              <Field label="Propietario o responsable"><input className="input" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} required /></Field>
              <Field label="Dirección" className="full"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} required /></Field>
              <Field label="Ciudad"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} required /></Field>
              <Field label="Teléfono"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <Field label="Nombre de usuario"><input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" required /></Field>
              <Field label="Correo"><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" required /></Field>
              <Field label="Contraseña" hint="Mínimo 10 caracteres, letras y números."><input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" required /></Field>
              <Field label="Confirmar contraseña"><input className="input" type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} autoComplete="new-password" required /></Field>
              <Field label="Logo (opcional)" className="full" hint="PNG, JPG o WebP. Máximo 2 MB."><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></Field>
            </div>
          )}
          {step === 3 && (
            <div className="flex-col gap-3">
              <Field label="Plan solicitado">
                <div className="grid grid-3">
                  {(plansQuery.data ?? []).map((plan) => (
                    <button type="button" key={plan.code} className={`card tight ${form.planCode === plan.code ? 'solid' : ''}`} style={{ textAlign: 'left', borderColor: form.planCode === plan.code ? 'var(--accent)' : undefined }} onClick={() => set('planCode', plan.code)}>
                      <strong>{plan.name}</strong>
                      <div className="muted small">{plan.description}</div>
                      <div className="mt-1 strong">${Number(plan.price).toLocaleString('es-CO')} / mes</div>
                    </button>
                  ))}
                </div>
              </Field>
              <label className="checkbox"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => set('termsAccepted', e.target.checked)} /> Acepto los términos y condiciones del servicio.</label>
              <label className="checkbox"><input type="checkbox" checked={form.dataAccepted} onChange={(e) => set('dataAccepted', e.target.checked)} /> Autorizo el tratamiento de datos conforme a la política de privacidad.</label>
            </div>
          )}
          <ErrorNotice error={error} />
          <div className="form-actions">
            {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Atrás</button>}
            {step < 3 ? (
              <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!canNext}>Continuar <ArrowRight /></button>
            ) : (
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? <Loader2 className="spinner" /> : <Sparkles />} Enviar solicitud</button>
            )}
          </div>
          <div className="auth-alt">¿Ya tiene cuenta? <Link to="/login">Iniciar sesión</Link></div>
        </div>
      </main>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{ message: string }>('/auth/forgot-password', { email }, { token: null });
      setMessage(response.message);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>Recuperar acceso</h1>
      <p className="lead">Si el correo está registrado, enviaremos un enlace de un solo uso con caducidad.</p>
      {message ? <div className="alert success"><Mail /><p>{message}</p></div> : (
        <form onSubmit={submit} className="flex-col gap-3">
          <Field label="Correo registrado"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <ErrorNotice error={error} />
          <button className="btn primary block" disabled={busy}>{busy ? <Loader2 className="spinner" /> : <Mail />} Enviar enlace</button>
        </form>
      )}
      <div className="auth-alt"><Link to="/login">Volver a iniciar sesión</Link></div>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password, confirmPassword }, { token: null });
      toast.success('Contraseña actualizada. Inicie sesión.');
      navigate('/login');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>Nueva contraseña</h1>
      <p className="lead">El enlace caduca y solo puede usarse una vez. Se cerrarán todas sus sesiones anteriores.</p>
      {!token ? <div className="alert danger"><KeyRound /><p>El enlace no contiene un token válido.</p></div> : (
        <form onSubmit={submit} className="flex-col gap-3">
          <Field label="Nueva contraseña"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required /></Field>
          <Field label="Confirmar contraseña"><input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} minLength={10} required /></Field>
          <ErrorNotice error={error} />
          <button className="btn primary block" disabled={busy}>{busy ? <Loader2 className="spinner" /> : <ShieldCheck />} Actualizar contraseña</button>
        </form>
      )}
      <div className="auth-alt"><Link to="/login">Volver</Link></div>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mandatory = me?.user.mustChangePassword;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword });
      await refresh();
      toast.success('Contraseña actualizada.');
      navigate(me?.store ? '/app' : '/admin', { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>{mandatory ? 'Cambio obligatorio' : 'Cambiar contraseña'}</h1>
      <p className="lead">
        {mandatory
          ? 'Su contraseña inicial debe cambiarse antes de operar. Las demás sesiones serán revocadas.'
          : 'Ingrese su contraseña actual para confirmar el cambio.'}
      </p>
      {!me ? <div className="alert warning"><LockKeyhole /><p>Debe iniciar sesión.</p></div> : (
        <form onSubmit={submit} className="flex-col gap-3">
          <Field label="Contraseña actual"><input className="input" type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></Field>
          <Field label="Nueva contraseña" hint="Mínimo 10 caracteres, letras y números; no debe contener el usuario."><input className="input" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} minLength={10} required autoComplete="new-password" /></Field>
          <Field label="Confirmar nueva contraseña"><input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} minLength={10} required autoComplete="new-password" /></Field>
          <ErrorNotice error={error} />
          <button className="btn primary block" disabled={busy}>{busy ? <Loader2 className="spinner" /> : <ShieldCheck />} Guardar contraseña</button>
        </form>
      )}
      {!mandatory && <div className="auth-alt"><Link to="/app/profile">Volver al perfil</Link></div>}
    </AuthLayout>
  );
}
