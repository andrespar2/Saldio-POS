# ADR 002 · PostgreSQL, Prisma y RLS

- **Estado:** aceptado.
- **Contexto:** se exige aislamiento multiempresa verificable y migraciones reproducibles.
- **Decisión:** PostgreSQL como fuente principal, Prisma para el acceso tipado y migraciones SQL versionadas. Se usa `tenantId` en todas las tablas de negocio, claves foráneas compuestas y RLS con `FORCE ROW LEVEL SECURITY`. La aplicación abre una transacción y fija `app.tenant_id` con `set_config(..., true)`.
- **Consecuencias:** una consulta sin contexto de empresa es rechazada por la base. Las tareas administrativas deben abrir contexto `platform` de forma explícita. El backend debe usar conexiones transaccionales; no es compatible con un pool que reutilice sesiones sin fijar el contexto (se usa el contexto local de transacción).
- **Alternativas descartadas:** filtrar solo en aplicación (insuficiente como defensa en profundidad) y esquema por tenant (costoso para migraciones y operación).
