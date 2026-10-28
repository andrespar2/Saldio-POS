import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Lock, Plus, RefreshCw, Scale } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

export function AccountingPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'config' | 'entries' | 'trial' | 'periods'>('config');
  const [entryOpen, setEntryOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: '', lines: [{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }] });
  const config = useQuery({ queryKey: ['accounting-config'], queryFn: () => api.get<Dict>('/tenant/accounting/config') });
  const accounts = useQuery({ queryKey: ['accounting-accounts'], queryFn: () => api.get<Dict[]>('/tenant/accounting/accounts') });
  const entries = useQuery({ queryKey: ['accounting-entries'], queryFn: () => api.get<Dict>('/tenant/accounting/entries?page=1&pageSize=30'), enabled: tab === 'entries' });
  const trial = useQuery({ queryKey: ['accounting-trial'], queryFn: () => api.get<Dict>('/tenant/accounting/trial-balance'), enabled: tab === 'trial' });
  const periods = useQuery({ queryKey: ['accounting-periods'], queryFn: () => api.get<Dict[]>('/tenant/accounting/periods'), enabled: tab === 'periods' });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.put('/tenant/accounting/config', { enabled }),
    onSuccess: () => { toast.success('Configuración contable actualizada.'); void qc.invalidateQueries({ queryKey: ['accounting-config'] }); void qc.invalidateQueries({ queryKey: ['accounting-accounts'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const createEntry = useMutation({
    mutationFn: () => api.post('/tenant/accounting/entries', form),
    onSuccess: () => { toast.success('Asiento registrado.'); setEntryOpen(false); void qc.invalidateQueries({ queryKey: ['accounting-entries'] }); void qc.invalidateQueries({ queryKey: ['accounting-trial'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const closePeriod = useMutation({
    mutationFn: (id: string) => api.post(`/tenant/accounting/periods/${id}/close`),
    onSuccess: () => { toast.success('Periodo cerrado.'); void qc.invalidateQueries({ queryKey: ['accounting-periods'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const reverse = useMutation({
    mutationFn: (id: string) => api.post(`/tenant/accounting/entries/${id}/reverse`, { reason: 'Reversión solicitada por contabilidad' }),
    onSuccess: () => { toast.success('Asiento reversado; el original se conserva.'); void qc.invalidateQueries({ queryKey: ['accounting-entries'] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const debit = form.lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const credit = form.lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
  const balanced = useMemo(() => Math.abs(debit - credit) < 0.005 && debit > 0, [debit, credit]);

  const enabled = config.data?.enabled;
  return (
    <>
      <PageHeader title="Contabilidad" description="Partida doble, diario, mayor y balance de prueba. Requiere revisión profesional." actions={enabled ? <button className="btn primary" onClick={() => setEntryOpen(true)}><Plus /> Asiento manual</button> : undefined} />
      <div className="tabs">{['config', 'entries', 'trial', 'periods'].map((value) => <button key={value} className={`tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value as typeof tab)}>{value === 'config' ? 'Configuración' : value === 'entries' ? 'Diario' : value === 'trial' ? 'Balance de prueba' : 'Periodos'}</button>)}</div>
      {tab === 'config' && (config.isLoading ? <Loading /> : config.error ? <ErrorNotice error={config.error} /> : (
        <div className="grid grid-2">
          <Card title="Módulo contable">
            <div className="toggle"><div><div className="label">Contabilidad habilitada</div><div className="hint">Al activarla se crea un plan de cuentas básico y un periodo del año actual.</div></div><button className={`switch ${enabled ? 'on' : ''}`} onClick={() => toggle.mutate(!enabled)} aria-label="Alternar contabilidad" /></div>
            <div className="alert warning mt-2"><Scale /><p>Esta contabilidad es básica y trazable. No constituye cumplimiento tributario integral ni sustituye la revisión de un contador.</p></div>
          </Card>
          <Card title="Plan de cuentas">
            {accounts.isLoading ? <Loading /> : <div className="table-wrap"><table className="table compact"><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th></tr></thead><tbody>{(accounts.data ?? []).map((a) => <tr key={a.id}><td className="mono">{a.code}</td><td>{a.name}</td><td><span className="badge neutral">{a.type}</span></td></tr>)}</tbody></table></div>}
          </Card>
        </div>
      ))}
      {tab === 'entries' && (entries.isLoading ? <Loading /> : entries.error ? <ErrorNotice error={entries.error} /> : (
        <Card>
          {entries.data!.items.length === 0 ? <EmptyState title="Sin asientos" icon={<BookOpen />} action={enabled ? <button className="btn primary" onClick={() => setEntryOpen(true)}>Crear asiento</button> : undefined} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Número</th><th>Fecha</th><th>Descripción</th><th>Origen</th><th>Estado</th><th className="num">Débito</th><th /></tr></thead><tbody>{entries.data!.items.map((e: Dict) => <tr key={e.id}><td className="mono">{e.number}</td><td className="small">{new Date(e.date).toLocaleDateString('es-CO')}</td><td>{e.description}</td><td>{e.sourceType}</td><td><StatusBadge status={e.status === 'REVERSED' ? 'CANCELLED' : 'CONFIRMED'} /></td><td className="num">{formatMoney(e.lines.reduce((sum: number, l: Dict) => sum + Number(l.debit), 0))}</td><td className="text-right">{e.status === 'POSTED' && <button className="btn sm ghost" onClick={() => reverse.mutate(e.id)}>Reversar</button>}</td></tr>)}</tbody></table></div>}
        </Card>
      ))}
      {tab === 'trial' && (trial.isLoading ? <Loading /> : trial.error ? <ErrorNotice error={trial.error} /> : (
        <Card title="Balance de prueba" subtitle={`Débitos ${formatMoney(trial.data!.totalDebit)} · Créditos ${formatMoney(trial.data!.totalCredit)}`}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th className="num">Débito</th><th className="num">Crédito</th><th className="num">Saldo</th></tr></thead><tbody>{trial.data!.rows.map((r: Dict) => <tr key={r.accountId}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.type}</td><td className="num">{formatMoney(r.debit)}</td><td className="num">{formatMoney(r.credit)}</td><td className="num strong">{formatMoney(r.balance)}</td></tr>)}</tbody></table></div>
          <div className={`alert mt-2 ${trial.data!.totalDebit === trial.data!.totalCredit ? 'success' : 'danger'}`}><Scale /><p>{trial.data!.totalDebit === trial.data!.totalCredit ? 'El balance está equilibrado.' : 'El balance no está equilibrado. Revise los asientos.'}</p></div>
        </Card>
      ))}
      {tab === 'periods' && (periods.isLoading ? <Loading /> : periods.error ? <ErrorNotice error={periods.error} /> : (
        <Card title="Periodos">
          <div className="table-wrap"><table className="table"><thead><tr><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Estado</th><th /></tr></thead><tbody>{(periods.data ?? []).map((p) => <tr key={p.id}><td>{p.name}</td><td className="small">{new Date(p.startDate).toLocaleDateString('es-CO')}</td><td className="small">{new Date(p.endDate).toLocaleDateString('es-CO')}</td><td><StatusBadge status={p.status} /></td><td className="text-right">{p.status === 'OPEN' && <button className="btn sm danger" onClick={() => closePeriod.mutate(p.id)}><Lock /> Cerrar</button>}</td></tr>)}</tbody></table></div>
        </Card>
      ))}

      <Modal open={entryOpen} title="Nuevo asiento contable" onClose={() => setEntryOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setEntryOpen(false)}>Cancelar</button><button className="btn primary" disabled={!balanced || createEntry.isPending} onClick={() => createEntry.mutate()}>Registrar asiento</button></>}>
        <div className="form-grid">
          <Field label="Fecha"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Descripción"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <div className="section-title"><h3>Líneas</h3><button className="btn sm ghost" onClick={() => setForm({ ...form, lines: [...form.lines, { accountId: '', debit: '', credit: '' }] })}><Plus /> Agregar</button></div>
        {form.lines.map((line, index) => <div className="grid grid-3 mb-2" key={index}><Field label="Cuenta"><select className="select" value={line.accountId} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, accountId: e.target.value } : l) })}><option value="">Seleccione</option>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field><Field label="Débito"><input className="input" inputMode="decimal" value={line.debit} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, debit: e.target.value, credit: '' } : l) })} /></Field><Field label="Crédito"><input className="input" inputMode="decimal" value={line.credit} onChange={(e) => setForm({ ...form, lines: form.lines.map((l, i) => i === index ? { ...l, credit: e.target.value, debit: '' } : l) })} /></Field></div>)}
        <div className="totals"><div className="row"><span>Débitos</span><span>{formatMoney(debit)}</span></div><div className="row"><span>Créditos</span><span>{formatMoney(credit)}</span></div><div className={`row ${balanced ? 'success-text' : 'danger-text'}`}><span>Diferencia</span><span>{formatMoney(debit - credit)}</span></div></div>
        <div className="alert info mt-2"><RefreshCw /><p>Un asiento desequilibrado es rechazado. Revertir no borra el asiento original.</p></div>
      </Modal>
    </>
  );
}
