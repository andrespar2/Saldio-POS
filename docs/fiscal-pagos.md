# Facturación y pagos

## Estado real de la beta

| Integración | Estado | Qué hace |
|---|---|---|
| Facturación electrónica | **No configurada / modo prueba** | Guarda configuración cifrada, crea documentos `TEST_SENT` con referencia de prueba y sin CUFE. No envía a la DIAN ni a un proveedor real. |
| Pagos | **Modo prueba / pendiente de configurar** | Acepta webhooks firmados, registra eventos idempotentes, valida cuenta/moneda/importe y deja conciliación. No cobra, no transfiere y no hace reparto automático. |

No hay credenciales productivas ni contrato con un proveedor. No se inventaron CUFE, resoluciones, autorizaciones, firmas ni respuestas de validación.

## Comprobante interno

El documento generado incluye:

- logo opcional, datos comerciales, razón social e identificación cuando existen;
- consecutivo interno, fecha y hora, sucursal, caja y vendedor;
- comprador cuando aplica;
- productos, cantidades, precio, descuentos, impuestos y total por línea;
- subtotal, total, medios de pago, efectivo recibido/cambio y saldo de crédito;
- pie exacto **“Generado por Saldio POS”**;
- leyenda: **“Comprobante de venta. No es una factura electrónica validada por la DIAN.”**

Es un comprobante comercial interno. No sustituye una factura electrónica ni constituye cumplimiento tributario integral.

## Preparación fiscal

El módulo `FiscalDocument` por empresa contempla:

- proveedor y modo (`TEST`/`PRODUCTION`);
- estados `PENDING`, `TEST_SENT`, `ACCEPTED`, `REJECTED`, `ERROR`, `DISABLED`;
- referencia, error, intentos y payload;
- configuración cifrada y registro de integración.

El envío productivo está bloqueado en el servicio: exige un adaptador certificado y credenciales verificadas. Para implementarlo se debe:

1. Revisar la documentación vigente de la DIAN y del proveedor autorizado.
2. Definir el formato, firma, resolución y numeración.
3. Implementar el adaptador con pruebas del proveedor.
4. Validar en sandbox y luego producción.
5. Documentar obligaciones y revisión contable/legal.

## Pagos

- Cada tienda puede registrar cuentas de pago (`StorePaymentAccount`) con referencia, moneda y modo.
- El webhook exige `x-saldio-signature` = HMAC-SHA256 del cuerpo crudo con `PAYMENTS_WEBHOOK_SECRET`.
- `PaymentEvent` es único por proveedor/evento; eventos repetidos devuelven `duplicate: true`.
- Se validan cuenta, moneda e importe; un evento desordenado no duplica un pago.
- La conciliación se registra en `IntegrationLog`. No se habilita reparto automático.

Si no hay secreto de webhook, el endpoint rechaza los eventos. Configure el secreto en el entorno y nunca en el repositorio.

## Suscripciones de Saldio vs cobros de comercio

La beta mantiene `Subscription` para la relación plataforma-tienda, pero no cobra suscripciones. Los eventos de pago se asocian a cuentas de tienda. Cualquier cobro real requiere contrato, credenciales, conciliación y revisión de comisiones versionadas.

## Activación productiva

Solo después de completar pruebas, contratos y credenciales:

- cambiar `PAYMENTS_MODE`/`FISCAL_MODE` a producción;
- configurar claves reales cifradas;
- probar webhooks firmados y reintentos;
- validar documentos con el proveedor/DIAN;
- monitorear y conciliar;
- documentar rollback.
