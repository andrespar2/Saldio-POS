import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone, Plus, Search, UserRound } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, PageHeader } from '../../components/ui';

type Dict = Record<string, any>;

function PartyPage({ kind }: { kind: 'customers' | 'suppliers' }) {
  const tenant = useTenant();
  const qc = useQueryClient();
  const isCustomer = kind === 'customers';
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dict | null>(null);
  const [form, setForm] = useState<Dict>({ name: '', taxId: '', phone: '', email: '', address: '', creditLimit: '0' });
  const canWrite = tenant.can(isCustomer ? 'customers.write' : 'suppliers.write');
  const query = useQuery({ queryKey: [kind, search], queryFn: () => api.get<Dict[]>(`/tenant/${kind}${queryString({ search })}`) });
  const save = useMutation({
    mutationFn: () => editing ? api.patch(`/tenant/${kind}/${editing.id}`, form) : api.post(`/tenant/${kind}`, form),
    onSuccess: () => { toast.success(isCustomer ? 'Cliente guardado.' : 'Proveedor guardado.'); setOpen(false); setEditing(null); void qc.invalidateQueries({ queryKey: [kind] }); },
    onError: (error) => toast.error((error as Error).message),
  });
  const openNew = () => { setEditing(null); setForm({ name: '', taxId: '', phone: '', email: '', address: '', creditLimit: '0' }); setOpen(true); };
  const openEdit = (party: Dict) => { setEditing(party); setForm({ name: party.name, taxId: party.taxId ?? '', phone: party.phone ?? '', email: party.email ?? '', address: party.address ?? '', creditLimit: party.creditLimit ?? '0', active: party.active }); setOpen(true); };
  return (
    <>
      <PageHeader title={isCustomer ? 'Clientes' : 'Proveedores'} description={isCustomer ? 'Historial, cupo de crédito y contacto.' : 'Contactos para compras y recepciones.'} actions={canWrite ? <button className="btn primary" onClick={openNew}><Plus /> {isCustomer ? 'Nuevo cliente' : 'Nuevo proveedor'}</button> : undefined} />
      <div className="toolbar"><div className="input-icon search"><Search /><input className="input" placeholder={`Buscar ${isCustomer ? 'cliente' : 'proveedor'}`} value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {query.isLoading ? <Loading /> : query.error ? <ErrorNotice error={query.error} /> : (
        <Card>
          {query.data!.length === 0 ? <EmptyState title={`Sin ${isCustomer ? 'clientes' : 'proveedores'}`} icon={isCustomer ? <UserRound /> : <Building2 />} action={canWrite ? <button className="btn primary" onClick={openNew}><Plus /> Crear</button> : undefined} /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Nombre</th><th>Identificación</th><th>Contacto</th><th>{isCustomer ? 'Cupo de crédito' : 'Dirección'}</th><th>Estado</th><th /></tr></thead><tbody>{query.data!.map((party) => <tr key={party.id}><td className="strong">{party.name}</td><td className="mono small">{party.taxId ?? '—'}</td><td className="small">{party.phone && <div><Phone size={12} /> {party.phone}</div>}{party.email && <div><Mail size={12} /> {party.email}</div>}{!party.phone && !party.email && '—'}</td><td className="num">{isCustomer ? formatMoney(party.creditLimit) : party.address ?? '—'}</td><td>{party.active === false ? <span className="badge danger">Inactivo</span> : <span className="badge success">Activo</span>}</td><td className="text-right">{canWrite && <button className="btn sm ghost" onClick={() => openEdit(party)}>Editar</button>}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      )}
      <Modal open={open} title={editing ? `Editar ${editing.name}` : isCustomer ? 'Nuevo cliente' : 'Nuevo proveedor'} onClose={() => setOpen(false)} footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Guardar</button></>}>
        <div className="form-grid">
          <Field label="Nombre"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Identificación"><input className="input" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Correo"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Dirección" className="full"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          {isCustomer && <Field label="Cupo de crédito" hint="0 significa sin crédito habilitado."><input className="input" inputMode="decimal" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></Field>}
          {editing && <label className="checkbox"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo</label>}
        </div>
      </Modal>
    </>
  );
}

export function CustomersPage() { return <PartyPage kind="customers" />; }
export function SuppliersPage() { return <PartyPage kind="suppliers" />; }
