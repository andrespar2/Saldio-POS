# Respaldo y recuperación

## Objetivo

Poder restaurar la operación sin pérdida de documentos confirmados ni mezclar empresas.

## Respaldo

### PostgreSQL

Use `pg_dump` con formato custom y cifrado en tránsito/almacenamiento:

```bash
pg_dump --format=custom --no-owner --file=saldio-$(date +%F).dump "$DATABASE_URL"
pg_restore --list saldio-2026-10-28.dump > saldio-2026-10-28.list
```

- Programe respaldos diarios y retención según política del negocio.
- Guarde copias fuera del servidor.
- Cifre el archivo y limite el acceso.
- Registre fecha, versión de esquema y hash.

### Archivos

Copie el contenido de `STORAGE_DIR` de forma consistente con la base. Los comprobantes históricos referencian archivos por identificador; un respaldo de base sin archivos puede perder logotipos.

### Secretos

Respalde las claves en el gestor de secretos, no junto al dump. Sin `JWT_ACCESS_SECRET` las sesiones existentes dejan de validar; sin `CONFIG_ENCRYPTION_KEY` no se pueden descifrar configuraciones de integración.

## Restauración probada

Procedimiento reproducible en un entorno aislado:

1. Cree una base vacía y un rol propietario.
2. Restaure el dump con `pg_restore --no-owner --clean --if-exists`.
3. Aplique migraciones pendientes con `prisma migrate deploy`.
4. Restaure archivos en un directorio privado.
5. Configure variables de entorno de prueba y arranque la API.
6. Verifique:
   - health y conteo de tiendas;
   - login de un administrador;
   - login de una tienda;
   - lectura de una venta y su comprobante;
   - suma de `StockLevel` contra movimientos;
   - balance de prueba equilibrado;
   - que una tienda no vea datos de otra (RLS).
7. Ejecute una venta de prueba y confirme que el consecutivo continúa.

La suite de integración se ejecuta contra PostgreSQL real y valida aislamiento, ventas, devoluciones, restaurante, contabilidad y recuperación. No se dispone de un respaldo productivo real porque no hay infraestructura desplegada; esta prueba debe repetirse con el respaldo del entorno destino.

## Frecuencia sugerida

- RPO objetivo: 24 h o menos (ajustar al negocio).
- RTO objetivo: definir con el propietario.
- Prueba de restauración: al menos trimestral y antes de cambios mayores.

## Incidente

1. Aísle la API si hay corrupción o acceso no autorizado.
2. No sobrescriba la base actual.
3. Restaure en una base nueva.
4. Verifique integridad y RLS antes de redirigir tráfico.
5. Documente causa, alcance y acciones.
6. Rote secretos y revoque sesiones si hubo exposición.
