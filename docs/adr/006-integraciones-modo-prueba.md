# ADR 006 · Integraciones fiscales y de pagos en modo prueba

- **Estado:** aceptado con bloqueo de producción.
- **Contexto:** no se suministraron credenciales productivas ni un contrato con proveedor fiscal/pagos. Inventar CUFE, autorizaciones o cobros sería incorrecto.
- **Decisión:** definir adaptadores desacoplados por empresa, estados, errores y reintentos. Sin credenciales, la UI muestra “modo prueba” o “pendiente de configurar”. El comprobante interno incluye la leyenda de que no es factura electrónica validada por la DIAN. El webhook de pagos exige HMAC y es idempotente; la conciliación se registra, pero no se ejecuta reparto automático.
- **Consecuencias:** la beta no sirve como cumplimiento fiscal ni como pasarela de producción. Activar producción exige credenciales, pruebas del proveedor, validación de la DIAN y revisión legal/contable.
