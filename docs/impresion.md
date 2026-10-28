# Impresión de comprobantes

## Formatos

- **58 mm:** térmica angosta; fuente reducida y saltos de línea controlados.
- **80 mm:** térmica estándar.
- **A4:** factura/comprobante de página completa.

La vista HTML y el PDF se generan desde el mismo snapshot. El PDF usa PDFKit con tamaño de página dinámico para térmicas (evita cortes) y A4 fijo. El pie y la leyenda fiscal siempre están presentes.

## Web

El botón **Imprimir** abre un iframe con el HTML y `@page` del ancho elegido. El navegador muestra el diálogo de impresión. La reimpresión usa `POST /sales/:id/print`, incrementa el contador y muestra **COPIA**. Imprimir no crea una nueva venta.

## Escritorio Windows

Electron usa una ventana oculta, carga el HTML y llama a `webContents.print`. El diálogo del sistema permite elegir la impresora y el tamaño. Para impresión silenciosa se requeriría configuración específica por impresora; no se activa por defecto.

## Recomendaciones

- Configure la impresora térmica con el ancho correcto (58 u 80 mm) y sin escalado.
- Verifique que el logo no exceda el ancho.
- Pruebe una venta con muchos productos y una devolución.
- No imprima desde el navegador con zoom alterado.
- La impresión no sustituye la validación fiscal.

## Limitaciones

- No hay integración con protocolos propietarios de balanzas ni impresoras fiscales certificadas.
- No se probó hardware físico en este entorno; las pruebas fueron de generación HTML/PDF y de la ventana de impresión del escritorio.
- El tamaño de papel depende del driver; el CSS declara 58/80/A4, pero el driver puede imponer otro.
