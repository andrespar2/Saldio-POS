# ADR 005 · Trabajos en segundo plano sin infraestructura externa

- **Estado:** aceptado.
- **Contexto:** correos, reintentos fiscales y vencimientos necesitan procesamiento asíncrono, pero no se justifica Redis/RabbitMQ en la beta.
- **Decisión:** tabla `Job` y worker interno con `FOR UPDATE SKIP LOCKED`, reintentos exponenciales, bloqueo temporal y estado visible. El correo se persiste en `EmailOutbox`.
- **Consecuencias:** el worker escala verticalmente con la API y no hay garantía de ejecución exacta si el proceso se cae a mitad; el bloqueo de 5 minutos permite reintentar. Para volumen alto se evaluará un worker dedicado o una cola administrada, manteniendo idempotencia.
