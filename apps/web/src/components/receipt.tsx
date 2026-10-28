import { useMemo } from 'react';
import { formatMoney } from '@saldio/shared';
import { Copy, Printer, X } from 'lucide-react';
import type { ReceiptSnapshot } from './receipt.types';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

function money(value: string, currency: string): string {
  return formatMoney(value, currency);
}

export function ReceiptPreview({
  snapshot,
  width,
  onClose,
}: {
  snapshot: ReceiptSnapshot;
  width: '58' | '80' | 'a4';
  onClose?: () => void;
}) {
  const date = useMemo(() => new Date(snapshot.date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }), [snapshot.date]);
  return (
    <div className={`receipt-preview ${width === 'a4' ? 'preview-a4' : width === '58' ? 'preview-58' : 'preview-80'}`}>
      <div className="receipt-preview-top no-print">
        <span className="badge neutral">Vista previa {width === 'a4' ? 'A4' : `${width} mm`}</span>
        <div className="flex gap-1">
          <button className="btn sm ghost" onClick={() => printReceipt(snapshot, width)}><Printer /> Imprimir</button>
          {onClose && <button className="btn sm ghost icon" onClick={onClose} aria-label="Cerrar"><X /></button>}
        </div>
      </div>
      <div className={`receipt ${width === 'a4' ? 'w-a4' : width === '58' ? 'w-58' : 'w-80'}`}>
        {snapshot.copy && <div className="copy-mark">COPIA</div>}
        {snapshot.logoUrl && <div className="r-logo"><img src={snapshot.logoUrl} alt="" /></div>}
        <div className="r-center r-strong r-store">{snapshot.store.name}</div>
        {snapshot.store.legalName && <div className="r-center r-small">{snapshot.store.legalName}</div>}
        {snapshot.store.taxId && <div className="r-center r-small">NIT / ID: {snapshot.store.taxId}</div>}
        <div className="r-center r-small">{snapshot.store.address}</div>
        <div className="r-center r-small">{snapshot.store.city} · Tel. {snapshot.store.phone}</div>
        <div className="r-center r-small">{snapshot.store.email}</div>
        <div className="r-sep" />
        <div className="r-center r-strong">Comprobante de venta {snapshot.number}</div>
        <div className="r-center r-small">{date}</div>
        <div className="r-center r-small">
          {[snapshot.branch?.name ? `Sucursal: ${snapshot.branch.name}` : '', snapshot.register?.name ? `Caja: ${snapshot.register.name}` : '', snapshot.cashier?.name ? `Vendedor: ${snapshot.cashier.name}` : ''].filter(Boolean).join(' · ')}
        </div>
        {snapshot.customer && <div className="r-small">Cliente: {snapshot.customer.name}{snapshot.customer.taxId ? ` · ${snapshot.customer.taxId}` : ''}</div>}
        <div className="r-sep" />
        <div className="r-items">
          {snapshot.items.map((item, index) => (
            <div className="r-item" key={`${item.description}-${index}`}>
              <div className="r-strong">{item.description}</div>
              <div className="r-row r-small"><span>{item.quantity} × {money(item.unitPrice, snapshot.currency)}{Number(item.taxRate) > 0 ? ` · IVA ${Number(item.taxRate).toFixed(0)}%` : ''}</span><span>{money(item.total, snapshot.currency)}</span></div>
              {Number(item.discount) > 0 && <div className="r-row r-small"><span>Descuento</span><span>-{money(item.discount, snapshot.currency)}</span></div>}
            </div>
          ))}
        </div>
        <div className="r-sep" />
        <div className="r-row"><span>Subtotal</span><span>{money(snapshot.subtotal, snapshot.currency)}</span></div>
        {Number(snapshot.discount) > 0 && <div className="r-row"><span>Descuentos</span><span>-{money(snapshot.discount, snapshot.currency)}</span></div>}
        {Number(snapshot.tax) > 0 && <div className="r-row"><span>Impuestos</span><span>{money(snapshot.tax, snapshot.currency)}</span></div>}
        <div className="r-row r-total"><span>TOTAL</span><span>{money(snapshot.total, snapshot.currency)}</span></div>
        {Number(snapshot.tip) > 0 && <div className="r-row"><span>Propina aceptada</span><span>{money(snapshot.tip, snapshot.currency)}</span></div>}
        <div className="r-row"><span>Pagado</span><span>{money(snapshot.paid, snapshot.currency)}</span></div>
        {Number(snapshot.balance) > 0 && <div className="r-row r-strong"><span>Saldo pendiente</span><span>{money(snapshot.balance, snapshot.currency)}</span></div>}
        <div className="r-sep" />
        <div className="r-payments">
          {snapshot.payments.map((payment, index) => (
            <div className="r-small" key={`${payment.method}-${index}`}>
              {PAYMENT_LABELS[payment.method] ?? payment.method}: {money(payment.amount, snapshot.currency)}
              {Number(payment.tip ?? 0) > 0 ? ` + propina ${money(payment.tip!, snapshot.currency)}` : ''}
              {payment.received && Number(payment.received) > Number(payment.amount) ? ` · recibido ${money(payment.received, snapshot.currency)} · cambio ${money(payment.change ?? '0', snapshot.currency)}` : ''}
            </div>
          ))}
        </div>
        {snapshot.notes && <div className="r-small r-notes">Notas: {snapshot.notes}</div>}
        <div className="r-sep" />
        <div className="r-center r-small r-fiscal">{snapshot.fiscal.legend}</div>
        <div className="r-center r-strong r-footer">{snapshot.footer}</div>
        <div className="r-center r-tiny">Documento interno. La impresión no registra una nueva venta.</div>
      </div>
    </div>
  );
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function receiptHtml(snapshot: ReceiptSnapshot, width: '58' | '80' | 'a4'): string {
  const mm = width === 'a4' ? '210mm' : `${width}mm`;
  const currency = snapshot.currency;
  const rows = snapshot.items.map((item) => `<div class="item"><strong>${esc(item.description)}</strong><div class="row small"><span>${esc(item.quantity)} × ${esc(money(item.unitPrice, currency))}${Number(item.taxRate) > 0 ? ` · IVA ${Number(item.taxRate).toFixed(0)}%` : ''}</span><span>${esc(money(item.total, currency))}</span></div>${Number(item.discount) > 0 ? `<div class="row small"><span>Descuento</span><span>-${esc(money(item.discount, currency))}</span></div>` : ''}</div>`).join('');
  const payments = snapshot.payments.map((p) => `<div class="small">${esc(PAYMENT_LABELS[p.method] ?? p.method)}: ${esc(money(p.amount, currency))}${Number(p.tip ?? 0) > 0 ? ` + propina ${esc(money(p.tip!, currency))}` : ''}${p.received && Number(p.received) > Number(p.amount) ? ` · recibido ${esc(money(p.received, currency))} · cambio ${esc(money(p.change ?? '0', currency))}` : ''}</div>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${esc(snapshot.number)}</title>
  <style>
    @page { size: ${mm} auto; margin: ${width === 'a4' ? '12mm' : '2mm'}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; }
    .receipt { width: ${width === 'a4' ? '186mm' : `calc(${mm} - 4mm)`}; margin: 0 auto; font-size: ${width === 'a4' ? '10pt' : width === '58' ? '7pt' : '8pt'}; line-height: 1.35; }
    .center { text-align: center; } .strong { font-weight: 700; } .small { font-size: .92em; } .tiny { font-size: .82em; }
    .logo { text-align: center; margin-bottom: 4px; } .logo img { max-width: ${width === 'a4' ? '42mm' : '18mm'}; max-height: ${width === 'a4' ? '22mm' : '12mm'}; object-fit: contain; }
    .store { font-size: 1.25em; font-weight: 700; }
    .sep { border-top: 1px dashed #888; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 2px 0; }
    .total { font-size: 1.22em; font-weight: 800; margin-top: 3px; }
    .copy { color: #b91c1c; font-weight: 800; text-align: right; font-size: 1.2em; }
    .fiscal { margin-top: 4px; }
    .footer { margin-top: 2px; }
    .notes { margin-top: 3px; }
  </style></head><body><div class="receipt">
    ${snapshot.copy ? '<div class="copy">COPIA</div>' : ''}
    ${snapshot.logoUrl ? `<div class="logo"><img src="${esc(snapshot.logoUrl)}" alt=""></div>` : ''}
    <div class="center strong store">${esc(snapshot.store.name)}</div>
    ${snapshot.store.legalName ? `<div class="center small">${esc(snapshot.store.legalName)}</div>` : ''}
    ${snapshot.store.taxId ? `<div class="center small">NIT / ID: ${esc(snapshot.store.taxId)}</div>` : ''}
    <div class="center small">${esc(snapshot.store.address)}</div>
    <div class="center small">${esc(snapshot.store.city)} · Tel. ${esc(snapshot.store.phone)}</div>
    <div class="center small">${esc(snapshot.store.email)}</div>
    <div class="sep"></div>
    <div class="center strong">Comprobante de venta ${esc(snapshot.number)}</div>
    <div class="center small">${esc(new Date(snapshot.date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }))}</div>
    <div class="center small">${esc([snapshot.branch?.name ? `Sucursal: ${snapshot.branch.name}` : '', snapshot.register?.name ? `Caja: ${snapshot.register.name}` : '', snapshot.cashier?.name ? `Vendedor: ${snapshot.cashier.name}` : ''].filter(Boolean).join(' · '))}</div>
    ${snapshot.customer ? `<div class="small">Cliente: ${esc(snapshot.customer.name)}${snapshot.customer.taxId ? ` · ${esc(snapshot.customer.taxId)}` : ''}</div>` : ''}
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${esc(money(snapshot.subtotal, currency))}</span></div>
    ${Number(snapshot.discount) > 0 ? `<div class="row"><span>Descuentos</span><span>-${esc(money(snapshot.discount, currency))}</span></div>` : ''}
    ${Number(snapshot.tax) > 0 ? `<div class="row"><span>Impuestos</span><span>${esc(money(snapshot.tax, currency))}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${esc(money(snapshot.total, currency))}</span></div>
    ${Number(snapshot.tip) > 0 ? `<div class="row"><span>Propina aceptada</span><span>${esc(money(snapshot.tip, currency))}</span></div>` : ''}
    <div class="row"><span>Pagado</span><span>${esc(money(snapshot.paid, currency))}</span></div>
    ${Number(snapshot.balance) > 0 ? `<div class="row strong"><span>Saldo pendiente</span><span>${esc(money(snapshot.balance, currency))}</span></div>` : ''}
    <div class="sep"></div>
    ${payments}
    ${snapshot.notes ? `<div class="small notes">Notas: ${esc(snapshot.notes)}</div>` : ''}
    <div class="sep"></div>
    <div class="center small fiscal">${esc(snapshot.fiscal.legend)}</div>
    <div class="center strong footer">${esc(snapshot.footer)}</div>
    <div class="center tiny">Documento interno. La impresión no registra una nueva venta.</div>
  </div></body></html>`;
}

export function printReceipt(snapshot: ReceiptSnapshot, width: '58' | '80' | 'a4'): void {
  const html = receiptHtml(snapshot, width);
  if (window.saldio?.printReceipt) {
    void window.saldio.printReceipt(html, width);
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1500);
  };
  if (iframe.contentWindow?.document.readyState === 'complete') window.setTimeout(run, 250);
  else iframe.onload = () => window.setTimeout(run, 250);
}

export function CopyBadge({ copy }: { copy: boolean }) {
  return copy ? <span className="badge warning"><Copy size={12} /> Copia</span> : null;
}
