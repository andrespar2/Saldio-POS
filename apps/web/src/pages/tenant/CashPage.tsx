import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Lock, Plus, Wallet } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

export function CashPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [registerId, setRegisterId] = useState(localStorage.getItem('saldio.registerId') ?? '');
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [moveModal, setMoveModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [move, setMove] = useState({ type: 'DEPOSIT', amount: '', description: '' });
  const registers = useQuery({ queryKey: ['cash-registers'], queryFn: () => api.get<Dict[]>('/tenant/registers') });
  const sessions = useQuery({ queryKey: ['cash-sessions'], queryFn: () => api.get<Dict[]>('/tenant/cash/sessions') });
  const current = useQuery({ queryKey: ['cash-current-page', registerId], queryFn: () => api.get<Dict | null>(`/tenant/cash/current?registerId=${registerId}`), enabled: Boolean(registerId) });
  const detail = useQuery({ queryKey: ['cash-session', current.data?.id], queryFn: () => api.get<Dict>(`/tenant/cash/sessions/${current.data!.id}`), enabled: Boolean(current.data?.id) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['cash-current-page'] }); void qc.invalidateQueries({ queryKey: ['cash-sessions'] }); void qc.invalidateQueries({ queryKey: ['cash-session'] }); };
  const open = useMutation({
    mutationFn: () => api.post('/tenant/cash/open', { registerId, openingAmount }),
    onSuccess: () => { toast.success('Caja abierta.'); setOpenModal(false); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const close = useMutation({
    mutationFn: () => api.post(`/tenant/cash/${current.data!.id}/close`, { countedAmount: counted, notes }),
    onSuccess: () => { toast.success('Caja cerrada. La diferencia quedó registrada.'); setCloseModal(false); setCounted(''); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const movement = useMutation({
    mutationFn: () => api.post(`/tenant/cash/${current.data!.id}/movements`, move),
    onSuccess: () => { toast.success('Movimiento registrado.'); setMoveModal(false); setMove({ type: 'DEPOSIT', amount: '', description: '' }); refresh(); },
    onError: (error) => toast.error((error as Error).message),
  });
  const session = detail.data;
  const expected = session?.movements?.reduce((sum: number, m: Dict) => sum + Number(m.amount), 0) ?? 0;

  return (
    <>
      <PageHeader title="Caja" description="Apertura, cierre, arqueo y movimientos de efectivo." actions={<select className="select" style={{ minWidth: 190 }} value={registerId} onChange={(e) => setRegisterId(e.target.value)}><option value="">Seleccione caja</option>{(registers.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.branch.name} · {r.name}</option>)}</select>} />
      {!registerId ? <Card><EmptyState title="Seleccione una caja" icon={<Wallet />} /></Card> : current.isLoading ? <Loading /> : current.error ? <ErrorNotice error={current.error} /> : !current.data ? (
        <Card><EmptyState title="Caja cerrada" description="Abra la caja para registrar ventas en efectivo y movimientos." icon={<Lock />} action={<button className="btn primary" onClick={() => setOpenModal(true)}><Plus /> Abrir caja</button>} /></Card>
      ) : (
        <>
          <div className="grid grid-4">
            <div className="card stat"><div className="stat-label">Estado</div><div className="stat-value"><StatusBadge status="OPEN" /></div><div className="stat-sub">{current.data.register?.name}</div></div>
            <div className="card stat"><div className="stat-label">Fondo inicial</div><div className="stat-value"><Money value={current.data.openingAmount} /></div></div>
            <div className="card stat"><div className="stat-label">Efectivo esperado</div><div className="stat-value"><Money value={expected} /></div><div className="stat-sub">Fondo + ventas − devoluciones − gastos</div></div>
            <div className="card stat"><div className="stat-label">Acciones</div><div className="flex gap-1 mt-1 wrap"><button className="btn sm ghost" onClick={() => setMoveModal(true)}><ArrowUpCircle /> Movimiento</button><button className="btn sm danger" onClick={() => { setCounted(String(expected)); setCloseModal(true); }}><Lock /> Cerrar</button></div></div>
          </div>
          <Card title="Movimientos de la sesión" className="mt-3" actions={<button className="btn sm ghost" onClick={() => setMoveModal(true)}><Plus /> Agregar</button>}>
            {!session ? <Loading /> : session.movements?.length === 0 ? <EmptyState title="Sin movimientos" /> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th className="num">Monto</th></tr></thead><tbody>{session.movements.map((m: Dict) => <tr key={m.id}><td className="small">{new Date(m.createdAt).toLocaleTimeString('es-CO')}</td><td><span className={`badge ${Number(m.amount) < 0 ? 'danger' : 'success'}`}>{m.type}</span></td><td>{m.description ?? '—'}</td><td className={`num ${Number(m.amount) < 0 ? 'danger-text' : 'success-text'}`}>{formatMoney(m.amount)}</td></tr>)}</tbody></table></div>
            )}
          </Card>
          <Card title="Historial de cajas" className="mt-3">
            {sessions.isLoading ? <Loading /> : <div className="table-wrap"><table className="table compact"><thead><tr><th>Apertura</th><th>Caja</th><th>Estado</th><th className="num">Apertura</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead><tbody>{(sessions.data ?? []).map((s) => <tr key={s.id}><td>{new Date(s.openedAt).toLocaleString('es-CO')}</td><td>{s.register?.name}</td><td><StatusBadge status={s.status} /></td><td className="num">{formatMoney(s.openingAmount)}</td><td className="num">{formatMoney(s.expectedAmount)}</td><td className="num">{s.countedAmount ? formatMoney(s.countedAmount) : '—'}</td><td className={`num ${Number(s.difference ?? 0) < 0 ? 'danger-text' : Number(s.difference ?? 0) > 0 ? 'warning-text' : ''}`}>{s.difference ? formatMoney(s.difference) : '—'}</td></tr>)}</tbody></table></div>}
          </Card>
        </>
      )}

      <Modal open={openModal} title="Abrir caja" onClose={() => setOpenModal(false)} footer={<><button className="btn ghost" onClick={() => setOpenModal(false)}>Cancelar</button><button className="btn primary" onClick={() => open.mutate()} disabled={open.isPending}>Abrir</button></>}>
        <Field label="Fondo inicial"><input className="input" inputMode="decimal" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} /></Field>
        <p className="inline-note mt-2">El fondo se registra como movimiento de apertura y forma parte del arqueo.</p>
      </Modal>
      <Modal open={closeModal} title="Cerrar y arquear caja" onClose={() => setCloseModal(false)} footer={<><button className="btn ghost" onClick={() => setCloseModal(false)}>Cancelar</button><button className="btn danger" onClick={() => close.mutate()} disabled={close.isPending}>Cerrar caja</button></>}>
        <div className="form-grid">
          <Field label="Efectivo esperado"><div className="input mono" style={{ display: 'flex', alignItems: 'center' }}>{formatMoney(expected)}</div></Field>
          <Field label="Efectivo contado"><input className="input" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
        </div>
        <div className="alert warning mt-2"><Banknote /><p>La diferencia se registra y queda auditada. No se modifica el historial de ventas.</p></div>
        <Field label="Notas"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </Modal>
      <Modal open={moveModal} title="Movimiento de caja" onClose={() => setMoveModal(false)} footer={<><button className="btn ghost" onClick={() => setMoveModal(false)}>Cancelar</button><button className="btn primary" onClick={() => movement.mutate()} disabled={movement.isPending}>Registrar</button></>}>
        <div className="form-grid">
          <Field label="Tipo"><select className="select" value={move.type} onChange={(e) => setMove({ ...move, type: e.target.value })}><option value="DEPOSIT">Depósito</option><option value="WITHDRAWAL">Retiro</option><option value="EXPENSE">Gasto</option><option value="ADJUSTMENT">Ajuste</option></select></Field>
          <Field label="Monto"><input className="input" inputMode="decimal" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} /></Field>
        </div>
        <Field label="Descripción"><input className="input" value={move.description} onChange={(e) => setMove({ ...move, description: e.target.value })} /></Field>
      </Modal>
    </>
  );
}

function Money({ value }: { value: string | number }) {
  return <>{formatMoney(value)}</>;
}
