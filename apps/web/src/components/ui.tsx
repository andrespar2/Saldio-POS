import { useEffect, type ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { ApiError } from '../lib/api';

export function Money({
  value,
  currency = 'COP',
  className,
}: {
  value: string | number | null | undefined;
  currency?: string;
  className?: string;
}) {
  if (value === null || value === undefined || value === '') return <span className={className}>—</span>;
  return <span className={className}>{formatMoney(value, currency)}</span>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  solid = false,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  solid?: boolean;
}) {
  return (
    <section className={`card ${solid ? 'solid' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="form-actions">{footer}</div>}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  PENDING: 'Pendiente',
  SUSPENDED: 'Suspendida',
  DISABLED: 'Deshabilitada',
  CONFIRMED: 'Confirmada',
  VOIDED: 'Anulada',
  PARTIALLY_REFUNDED: 'Devuelta parcial',
  REFUNDED: 'Devuelta',
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  PAID: 'Pagada',
  PARTIAL: 'Parcial',
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  ORDERED: 'Ordenada',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
  PREPARING: 'Preparando',
  READY: 'Listo',
  SERVED: 'Servido',
  FREE: 'Libre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  CONVERTED: 'Convertida',
  TEST_SENT: 'Prueba enviada',
  ERROR: 'Error',
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE' || status === 'CONFIRMED' || status === 'RECEIVED' || status === 'PAID' || status === 'READY' || status === 'FREE'
      ? 'success'
      : status === 'PENDING' || status === 'SUSPENDED' || status === 'OPEN' || status === 'PARTIAL' || status === 'PREPARING' || status === 'OCCUPIED'
        ? 'warning'
        : status === 'DISABLED' || status === 'CANCELLED' || status === 'REFUNDED' || status === 'ERROR'
          ? 'danger'
          : 'neutral';
  return <span className={`badge ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading-block">
      <Loader2 className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <AlertCircle />}</div>
      <h3>{title}</h3>
      {description && <p className="small">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  const code = apiError?.code;
  return (
    <div className={`alert ${code === 'STORE_SUSPENDED' || code === 'STORE_DISABLED' ? 'danger' : 'warning'}`} role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <p>{message}</p>
        {code === 'STORE_SUSPENDED' && (
          <p className="small mt-1">Puede escribir a soporte@saldio.app indicando el nombre de su tienda.</p>
        )}
        {code === 'NETWORK_ERROR' && (
          <p className="small mt-1">Los borradores locales no se están enviando. Reintente cuando recupere la conexión.</p>
        )}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) {
    return <div className="pagination"><span>{total} registro(s)</span></div>;
  }
  return (
    <div className="pagination">
      <span>{total} registro(s) · página {page} de {pages}</span>
      <div className="pages">
        <button className="btn sm ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior">
          <ChevronLeft size={14} />
        </button>
        <button className="btn sm ghost" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Siguiente">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
