# Guía del vendedor y operación por sector

## Antes de vender

1. Abra la caja del registro correspondiente con el fondo inicial.
2. Verifique que los productos tengan precio, impuesto y stock.
3. En restaurante, confirme que las mesas y el área estén configuradas.

## POS (todos los sectores)

- **F2:** enfocar búsqueda.
- **F4:** abrir caja si está cerrada.
- **F9:** abrir el cobro.
- **Esc:** cerrar modales.
- Escanee un código y presione Enter; también puede tocar un producto.
- Las cantidades decimales solo se permiten si la unidad del producto lo admite.
- Los descuentos requieren permiso `sales.discount`; si no lo tiene, el campo no debe usarse.
- Los pagos mixtos se validan en servidor: la suma debe cubrir el total, salvo venta a crédito.
- La propina solo se agrega si se marca la aceptación del cliente.
- El comprobante se puede previsualizar en 58 mm, 80 mm y A4. La reimpresión se marca **COPIA**.
- Si falla la red, la venta no se confirma. No repita el cobro: el botón envía una clave de idempotencia y evita duplicados.

## Supermercado o minimercado

- Venta por unidad y por peso (kg/litro) con cantidad decimal.
- Búsqueda por nombre, SKU o código de barras.
- Stock mínimo, lotes y vencimientos si el producto los habilita.
- Compras y recepción parcial; los movimientos conservan trazabilidad.
- Devoluciones totales o parciales con reingreso o desperdicio.
- Reportes por producto, categoría y medio de pago.

No existe integración con balanzas físicas; no se debe prometer.

## Restaurante o cafetería

1. Toque una mesa libre y abra el pedido.
2. Agregue productos, cantidades y observaciones.
3. **Enviar a cocina** descuenta inventario una sola vez.
4. Cocina cambia estados: pendiente → preparando → listo → servido.
5. **Separar** mueve líneas seleccionadas a una cuenta hija; no duplica ni pierde líneas.
6. **Cobrar** puede ser parcial o mixto. Si hay saldo y el cliente tiene cupo, queda cartera.
7. La propina es opcional y debe aceptarse explícitamente.
8. Anular una línea o pedido exige motivo; el desperdicio no reingresa stock.

## Ropa y accesorios

- Cree variantes por talla y color, cada una con SKU, código y stock.
- El POS exige seleccionar la variante.
- Los cambios y devoluciones se registran como documentos relacionados.
- Reportes por producto; el filtro por talla/color se obtiene de las variantes.

## Ferretería

- Unidades fraccionarias y conversiones configuradas explícitamente.
- Precio minorista y mayorista por cantidad mínima.
- Cotizaciones convertibles en venta a crédito.
- Compras, proveedores y bodegas.
- Cartera y abonos.
- Reportes de inventario y margen.

## Tienda general

Productos, ventas, clientes, inventario, compras, gastos, caja y reportes básicos.

## Caja

- Solo puede existir una sesión abierta por caja.
- Al cerrar, cuente el efectivo; la diferencia se registra y audita.
- Depósitos, retiros, gastos y ajustes requieren descripción.
- Una venta en efectivo sin caja abierta se rechaza.

## Devoluciones

- Seleccione la venta y las cantidades dentro de lo disponible.
- Indique motivo y método de reembolso.
- Decida si reingresa inventario o se trata como desperdicio.
- El efectivo requiere una caja abierta.
- La venta original no se borra.

## Si algo no cuadra

- Revise el comprobante y los movimientos de caja.
- No edite ni borre documentos confirmados.
- Registre una devolución, ajuste con motivo o solicite soporte.
- El soporte de plataforma es de solo lectura y queda auditado.
