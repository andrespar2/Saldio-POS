import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Package, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { formatMoney } from '@saldio/shared';
import { api, queryString } from '../../lib/api';
import { useTenant } from '../../lib/tenant';
import { toast } from '../../lib/toast';
import { Card, EmptyState, ErrorNotice, Field, Loading, Modal, Pagination, PageHeader, StatusBadge } from '../../components/ui';

type Dict = Record<string, any>;

const emptyProduct = {
  sku: '', barcode: '', name: '', description: '', type: 'SIMPLE', categoryId: '', taxId: '', unitId: '',
  price: '0', wholesalePrice: '', wholesaleMinQty: '6', cost: '0', trackInventory: true, lotTracking: false,
  reorderPoint: '', initialStock: '0', warehouseId: '',
};

export function ProductsPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dict | null>(null);
  const [form, setForm] = useState<Dict>(emptyProduct);
  const [variantProduct, setVariantProduct] = useState<Dict | null>(null);
  const [variantForm, setVariantForm] = useState({ sku: '', barcode: '', size: '', color: '', priceOverride: '', initialStock: '0', warehouseId: '' });
  const canWrite = tenant.can('catalog.write');

  const products = useQuery({
    queryKey: ['products', search, page],
    queryFn: () => api.get<{ items: Dict[]; meta: Dict }>(`/tenant/products${queryString({ search, page, pageSize: 25 })}`),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Dict[]>('/tenant/categories') });
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => api.get<Dict[]>('/tenant/taxes') });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Dict[]>('/tenant/units') });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Dict[]>('/tenant/warehouses'), enabled: canWrite });

  const save = useMutation({
    mutationFn: () => editing
      ? api.patch(`/tenant/products/${editing.id}`, {
          name: form.name, barcode: form.barcode || undefined, description: form.description || undefined,
          categoryId: form.categoryId || undefined, taxId: form.taxId || undefined, unitId: form.unitId,
          price: form.price, wholesalePrice: form.wholesalePrice || undefined, wholesaleMinQty: form.wholesaleMinQty,
          cost: form.cost, trackInventory: form.trackInventory, lotTracking: form.lotTracking,
          reorderPoint: form.reorderPoint || undefined, active: form.active ?? true,
        })
      : api.post('/tenant/products', {
          sku: form.sku, barcode: form.barcode || undefined, name: form.name, description: form.description || undefined,
          type: form.type, categoryId: form.categoryId || undefined, taxId: form.taxId || undefined, unitId: form.unitId,
          price: form.price, wholesalePrice: form.wholesalePrice || undefined, wholesaleMinQty: form.wholesaleMinQty,
          cost: form.cost, trackInventory: form.trackInventory, lotTracking: form.lotTracking,
          reorderPoint: form.reorderPoint || undefined, initialStock: form.initialStock || undefined,
          warehouseId: form.warehouseId || undefined,
        }),
    onSuccess: () => { toast.success(editing ? 'Producto actualizado.' : 'Producto creado.'); setOpen(false); setEditing(null); void qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (error) => toast.error((error as Error).message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.del(`/tenant/products/${id}`),
    onSuccess: () => { toast.success('Producto desactivado. El historial se conserva.'); void qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (error) => toast.error((error as Error).message),
  });

  const addVariant = useMutation({
    mutationFn: () => api.post(`/tenant/products/${variantProduct!.id}/variants`, {
      sku: variantForm.sku, barcode: variantForm.barcode || undefined, size: variantForm.size || undefined,
      color: variantForm.color || undefined, priceOverride: variantForm.priceOverride || undefined,
      initialStock: variantForm.initialStock || undefined, warehouseId: variantForm.warehouseId || undefined,
    }),
    onSuccess: () => { toast.success('Variante creada.'); setVariantForm({ sku: '', barcode: '', size: '', color: '', priceOverride: '', initialStock: '0', warehouseId: '' }); void qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (error) => toast.error((error as Error).message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyProduct, unitId: units.data?.[0]?.id ?? '', taxId: taxes.data?.[0]?.id ?? '', warehouseId: warehouses.data?.[0]?.id ?? '' });
    setOpen(true);
  };
  const openEdit = (product: Dict) => {
    setEditing(product);
    setForm({
      ...emptyProduct, ...product,
      categoryId: product.category?.id ?? '', taxId: product.tax?.id ?? '', unitId: product.unit?.id ?? '',
      reorderPoint: product.reorderPoint ?? '', initialStock: '0', warehouseId: warehouses.data?.[0]?.id ?? '',
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader title="Productos" description="Catálogo, precios, impuestos, variantes y existencias por bodega." actions={canWrite ? <button className="btn primary" onClick={openNew}><Plus /> Nuevo producto</button> : undefined} />
      <div className="toolbar">
        <div className="input-icon search"><Search /><input className="input" placeholder="Nombre, SKU o código de barras" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <span className="badge neutral">{products.data?.meta.total ?? 0} productos</span>
      </div>
      {products.isLoading ? <Loading /> : products.error ? <ErrorNotice error={products.error} /> : (
        <Card>
          {products.data!.items.length === 0 ? <EmptyState title="Sin productos" description="Cree su primer producto para empezar a vender." icon={<Package />} action={canWrite ? <button className="btn primary" onClick={openNew}><Plus /> Crear producto</button> : undefined} /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th>Unidad</th><th className="num">Precio</th><th className="num">Stock</th><th>Estado</th><th /></tr></thead><tbody>
              {products.data!.items.map((product) => (
                <tr key={product.id}>
                  <td><div className="strong">{product.name}</div><div className="tiny faint">{product.tax ? `${product.tax.name} ${Number(product.tax.rate)}%` : 'Sin impuesto'} · {product.variants.length} variantes</div></td>
                  <td className="mono small">{product.sku}<div className="tiny faint">{product.barcode ?? '—'}</div></td>
                  <td>{product.category?.name ?? '—'}</td>
                  <td>{product.unit?.code}</td>
                  <td className="num">{formatMoney(product.price)}</td>
                  <td className="num">{product.totalStock}{product.lowStock && <div className="tiny warning-text">Bajo mínimo</div>}</td>
                  <td>{product.active ? <span className="badge success">Activo</span> : <span className="badge danger">Inactivo</span>}</td>
                  <td className="text-right">
                    {canWrite && <>
                      {product.type === 'VARIANT' && <button className="btn sm ghost" onClick={() => { setVariantProduct(product); setVariantForm({ ...variantForm, warehouseId: warehouses.data?.[0]?.id ?? '' }); }}><Tag /></button>}
                      <button className="btn sm ghost" onClick={() => openEdit(product)}><Edit3 /></button>
                      <button className="btn sm ghost" onClick={() => deactivate.mutate(product.id)} disabled={!product.active}><Trash2 /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
          <Pagination page={products.data!.meta.page} pages={products.data!.meta.pages} total={products.data!.meta.total} onChange={setPage} />
        </Card>
      )}

      <Modal open={open} title={editing ? `Editar ${editing.name}` : 'Nuevo producto'} onClose={() => setOpen(false)} wide footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Guardar</button></>}>
        <div className="form-grid">
          <Field label="Nombre"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="SKU"><input className="input" value={form.sku} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Código de barras"><input className="input" value={form.barcode ?? ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
          <Field label="Tipo"><select className="select" value={form.type} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="SIMPLE">Simple</option><option value="VARIANT">Con variantes</option><option value="WEIGHTED">Por peso</option><option value="SERVICE">Servicio</option><option value="RECIPE">Receta</option></select></Field>
          <Field label="Categoría"><select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Sin categoría</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Impuesto"><select className="select" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })}><option value="">Sin impuesto</option>{(taxes.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}</select></Field>
          <Field label="Unidad"><select className="select" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>{(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}{u.allowDecimal ? ' (decimal)' : ''}</option>)}</select></Field>
          <Field label="Precio de venta"><input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Costo"><input className="input" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label="Precio mayorista"><input className="input" inputMode="decimal" value={form.wholesalePrice ?? ''} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></Field>
          <Field label="Cantidad mínima mayorista"><input className="input" inputMode="decimal" value={form.wholesaleMinQty} onChange={(e) => setForm({ ...form, wholesaleMinQty: e.target.value })} /></Field>
          <Field label="Stock mínimo"><input className="input" inputMode="decimal" value={form.reorderPoint ?? ''} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} /></Field>
          <Field label="Descripción" className="full"><textarea className="textarea" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {!editing && <>
            <Field label="Stock inicial"><input className="input" inputMode="decimal" value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: e.target.value })} /></Field>
            <Field label="Bodega inicial"><select className="select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          </>}
          <label className="checkbox"><input type="checkbox" checked={form.trackInventory} onChange={(e) => setForm({ ...form, trackInventory: e.target.checked })} /> Controlar inventario</label>
          <label className="checkbox"><input type="checkbox" checked={form.lotTracking} onChange={(e) => setForm({ ...form, lotTracking: e.target.checked })} /> Manejar lotes y vencimientos</label>
        </div>
      </Modal>

      <Modal open={Boolean(variantProduct)} title={`Variantes · ${variantProduct?.name ?? ''}`} onClose={() => setVariantProduct(null)} wide>
        <div className="grid grid-2">
          <div>
            <div className="section-title"><h3>Existentes</h3></div>
            <div className="list">{variantProduct?.variants.map((variant: Dict) => <div className="list-row" key={variant.id}><div className="avatar">{variant.size?.slice(0, 2) ?? 'V'}</div><div className="grow"><div>{variant.sku}</div><div className="meta">{[variant.size, variant.color].filter(Boolean).join(' / ') || 'Sin atributos'} · {formatMoney(variant.priceOverride ?? variantProduct.price)}</div></div></div>)}</div>
          </div>
          <div>
            <div className="section-title"><h3>Nueva variante</h3></div>
            <div className="form-grid">
              <Field label="SKU"><input className="input" value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })} /></Field>
              <Field label="Código"><input className="input" value={variantForm.barcode} onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })} /></Field>
              <Field label="Talla"><input className="input" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} /></Field>
              <Field label="Color"><input className="input" value={variantForm.color} onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })} /></Field>
              <Field label="Precio propio"><input className="input" inputMode="decimal" value={variantForm.priceOverride} onChange={(e) => setVariantForm({ ...variantForm, priceOverride: e.target.value })} /></Field>
              <Field label="Stock inicial"><input className="input" inputMode="decimal" value={variantForm.initialStock} onChange={(e) => setVariantForm({ ...variantForm, initialStock: e.target.value })} /></Field>
              <Field label="Bodega"><select className="select" value={variantForm.warehouseId} onChange={(e) => setVariantForm({ ...variantForm, warehouseId: e.target.value })}>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            </div>
            <button className="btn primary mt-2" onClick={() => addVariant.mutate()} disabled={!variantForm.sku || addVariant.isPending}><Plus /> Agregar variante</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
