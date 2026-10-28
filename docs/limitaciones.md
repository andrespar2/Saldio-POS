# Limitaciones conocidas

Esta beta es funcional en los flujos documentados, pero no es un producto terminado para producción sin las acciones indicadas.

## Infraestructura

- **El backend central no está desplegado.** No hay dominio, TLS, base gestionada, SMTP ni almacenamiento privado operados por el agente. El instalador requiere configurar una URL de API.
- Docker Compose no se ejecutó porque Docker no está instalado en el equipo de construcción.
- No hay pipeline de respaldo automático; el procedimiento está documentado y debe operarse.

## Fiscal y pagos

- No existe integración fiscal productiva ni CUFE. Los documentos fiscales son de prueba o están deshabilitados.
- No hay credenciales productivas de pagos, conciliación bancaria real ni reparto automático.
- No se validó con la DIAN ni con un proveedor autorizado.
- Los comprobantes son internos y no cumplen por sí solos obligaciones tributarias.

## Escritorio

- El instalador **no está firmado**. Windows puede mostrar advertencia de editor desconocido.
- No hay actualización automática; se descarga una nueva Release y se instala encima conservando preferencias.
- La impresión térmica se probó por generación HTML/PDF y diálogo del sistema, no con una impresora física.
- No hay modo offline completo: la venta y operaciones protegidas requieren backend.

## Sectores

- No se implementó una plataforma de repartidores.
- No hay integración con balanzas físicas ni protocolos propietarios.
- Recetas existen en modelo y descuentan ingredientes; la gestión visual avanzada de recetas es básica.
- Cambios de sector están protegidos, pero la migración masiva de datos entre sectores no es automática.
- Reportes por talla/color se apoyan en variantes; no hay una pantalla dedicada de analítica de moda.

## Contabilidad

- Es contabilidad básica de partida doble, no un cumplimiento contable integral.
- No incluye impuestos diferidos, nómina, activos fijos, consolidación ni cierres fiscales avanzados.
- La contabilización automática cubre ventas; devoluciones y compras requieren revisión/expansión.
- Requiere validación de un contador.

## Seguridad

- No hay auditoría externa ni prueba de penetración.
- Tokens web en `localStorage`; se recomienda migrar a cookies `HttpOnly` + CSRF si el modelo de amenaza lo exige.
- Faltan políticas de retención y borrado aprobadas.
- El cambio de correo de recuperación/propietario está restringido y documentado como proceso de soporte; no hay flujo automático.

## Escala y calidad

- No se afirma “cero bugs”.
- Las pruebas de rendimiento son locales con 10.000 productos; no simulan concurrencia distribuida.
- No se probaron todas las combinaciones de plan, sector, rol y sucursal de forma exhaustiva, aunque las reglas centrales están cubiertas.
- La aplicación no tiene licencia de código abierto seleccionada.

## Datos y privacidad

- La política de tratamiento de datos es aceptada en el registro, pero el texto legal definitivo debe ser revisado por el propietario.
- Los logos son opcionales y se validan por contenido; no hay antivirus.
- El correo sin SMTP queda en bandeja de salida y no se entrega.
