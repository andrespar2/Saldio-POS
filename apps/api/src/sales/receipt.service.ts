import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { StorageService } from '../common/storage.service';
import type { ReceiptSnapshot } from './receipt.types';

const MM = 72 / 25.4;

function money(value: string, currency: string): string {
  const n = Number(value);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'COP' ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

@Injectable()
export class ReceiptService {
  constructor(private readonly storage: StorageService) {}

  async pdf(
    snapshot: ReceiptSnapshot,
    width: '58' | '80' | 'a4' = '80',
  ): Promise<Buffer> {
    const isA4 = width === 'a4';
    const pageWidth = isA4 ? 595.28 : Number(width) * MM;
    const estimatedHeight = Math.max(
      isA4 ? 841.89 : 360,
      320 + snapshot.items.length * (isA4 ? 26 : 46) + snapshot.payments.length * 16,
    );
    const pageHeight = isA4 ? 841.89 : Math.min(estimatedHeight, 5000);
    const margin = isA4 ? 42 : 10;
    const contentWidth = pageWidth - margin * 2;
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      autoFirstPage: true,
      info: {
        Title: `Comprobante ${snapshot.number}`,
        Author: 'Saldio POS',
        Creator: 'Saldio POS',
        Subject: 'Comprobante de venta',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const baseFont = isA4 ? 9 : 7.5;
    const small = isA4 ? 8 : 6.8;
    const title = isA4 ? 16 : 11;
    let y = margin;

    const text = (
      value: string,
      options: { size?: number; bold?: boolean; align?: 'left' | 'right' | 'center'; width?: number; x?: number } = {},
    ) => {
      const size = options.size ?? baseFont;
      const font = options.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fontSize(size);
      const x = options.x ?? margin;
      const w = options.width ?? contentWidth;
      const height = doc.heightOfString(value, { width: w, align: options.align ?? 'left' });
      if (y + height > pageHeight - margin - 20) {
        doc.addPage({ size: [pageWidth, pageHeight], margins: { top: margin, bottom: margin, left: margin, right: margin } });
        y = margin;
      }
      doc.text(value, x, y, { width: w, align: options.align ?? 'left' });
      y += height + (isA4 ? 2 : 1.5);
    };

    if (snapshot.copy) {
      doc.save();
      doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(title * 1.6);
      doc.text('COPIA', margin, y, { width: contentWidth, align: 'right' });
      doc.restore();
      y += title * 1.8;
    }

    if (snapshot.store.logoFileId) {
      const logo = await this.storage.readForTenant(
        snapshot.store.logoFileId,
        snapshot.store.id,
      );
      if (logo?.buffer) {
        try {
          const logoWidth = isA4 ? 110 : 52;
          const logoHeight = isA4 ? 50 : 28;
          doc.image(logo.buffer, margin, y, {
            fit: [logoWidth, logoHeight],
            align: 'center',
            valign: 'center',
          });
          y += logoHeight + 4;
        } catch {
          // Un logo invalido no debe impedir la impresion del comprobante.
        }
      }
    }

    text(snapshot.store.name, { size: title, bold: true, align: 'center' });
    if (snapshot.store.legalName) {
      text(snapshot.store.legalName, { size: small, align: 'center' });
    }
    if (snapshot.store.taxId) {
      text(`NIT / ID: ${snapshot.store.taxId}`, { size: small, align: 'center' });
    }
    text(snapshot.store.address, { size: small, align: 'center' });
    text(
      `${snapshot.store.city} · Tel. ${snapshot.store.phone} · ${snapshot.store.email}`,
      { size: small, align: 'center' },
    );
    y += 3;
    doc
      .moveTo(margin, y)
      .lineTo(pageWidth - margin, y)
      .strokeColor('#999999')
      .lineWidth(0.5)
      .stroke();
    y += 5;
    text(`Comprobante de venta ${snapshot.number}`, { bold: true, align: 'center' });
    text(
      new Date(snapshot.date).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      { size: small, align: 'center' },
    );
    const place = [
      snapshot.branch?.name ? `Sucursal: ${snapshot.branch.name}` : null,
      snapshot.register?.name ? `Caja: ${snapshot.register.name}` : null,
      snapshot.cashier?.name ? `Vendedor: ${snapshot.cashier.name}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (place) text(place, { size: small, align: 'center' });
    if (snapshot.customer) {
      text(
        `Cliente: ${snapshot.customer.name}${snapshot.customer.taxId ? ` · ${snapshot.customer.taxId}` : ''}`,
        { size: small },
      );
    }
    y += 3;
    doc
      .moveTo(margin, y)
      .lineTo(pageWidth - margin, y)
      .strokeColor('#cccccc')
      .stroke();
    y += 5;

    for (const item of snapshot.items) {
      text(item.description, { size: baseFont, bold: true });
      const detail = `${item.quantity} × ${money(item.unitPrice, snapshot.currency)}`;
      const taxLabel = Number(item.taxRate) > 0 ? ` · IVA ${Number(item.taxRate).toFixed(0)}%` : '';
      text(detail + taxLabel, { size: small });
      if (Number(item.discount) > 0) {
        text(`Descuento: -${money(item.discount, snapshot.currency)}`, { size: small });
      }
      text(money(item.total, snapshot.currency), {
        size: baseFont,
        bold: true,
        align: 'right',
      });
    }

    y += 3;
    doc
      .moveTo(margin, y)
      .lineTo(pageWidth - margin, y)
      .strokeColor('#999999')
      .stroke();
    y += 5;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(baseFont);
      const h = doc.heightOfString(label, { width: contentWidth });
      doc.text(label, margin, y, { width: contentWidth * 0.6 });
      doc.text(value, margin + contentWidth * 0.6, y, {
        width: contentWidth * 0.4,
        align: 'right',
      });
      y += Math.max(h, baseFont) + 2;
    };
    row('Subtotal', money(snapshot.subtotal, snapshot.currency));
    if (Number(snapshot.discount) > 0) {
      row('Descuentos', `-${money(snapshot.discount, snapshot.currency)}`);
    }
    if (Number(snapshot.tax) > 0) {
      row('Impuestos', money(snapshot.tax, snapshot.currency));
    }
    row('TOTAL', money(snapshot.total, snapshot.currency), true);
    if (Number(snapshot.tip) > 0) {
      row('Propina aceptada', money(snapshot.tip, snapshot.currency));
    }
    if (Number(snapshot.paid) > 0) {
      row('Pagado', money(snapshot.paid, snapshot.currency));
    }
    if (Number(snapshot.balance) > 0) {
      row('Saldo pendiente', money(snapshot.balance, snapshot.currency), true);
    }
    y += 2;
    for (const payment of snapshot.payments) {
      const extra =
        payment.received && Number(payment.received) > Number(payment.amount)
          ? ` (recibido ${money(payment.received, snapshot.currency)}, cambio ${money(payment.change ?? '0', snapshot.currency)})`
          : '';
      text(
        `${payment.method} · ${money(payment.amount, snapshot.currency)}${payment.tip && Number(payment.tip) > 0 ? ` + propina ${money(payment.tip, snapshot.currency)}` : ''}${extra}`,
        { size: small },
      );
    }
    if (snapshot.notes) {
      text(`Notas: ${snapshot.notes}`, { size: small });
    }
    y += 4;
    text(snapshot.fiscal.legend, { size: small, align: 'center' });
    text(snapshot.footer, { size: baseFont, bold: true, align: 'center' });
    doc.end();
    return done;
  }
}
