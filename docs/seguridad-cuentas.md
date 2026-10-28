# Seguridad y recuperación de cuentas

## Controles implementados

- Hash `scrypt` con salt y parámetros versionados; nunca se guarda la contraseña.
- Access JWT de 15 min y refresh rotatorio; el refresh se guarda solo como hash.
- Detección de reutilización de refresh: revoca todas las sesiones del usuario.
- Sesiones revocables; suspender una tienda revoca sus sesiones.
- Guards de autenticación, membresía, estado, plan, módulo y permisos.
- RLS forzado en PostgreSQL y claves foráneas compuestas por empresa.
- Validación de DTOs con whitelist y rechazo de campos no declarados.
- Rate limiting global y límites más estrictos en login/recuperación.
- Bloqueo temporal tras intentos fallidos; respuestas genéricas de recuperación.
- Helmet, CORS restringido, CSP en la web y cabeceras de seguridad.
- Archivos privados con validación de tipo real, tamaño, hash y URL firmada temporal.
- Secretos de integración cifrados con AES-256-GCM; nunca se devuelven al cliente.
- Auditoría administrativa y de tienda; no se guardan secretos.
- Sesiones de soporte explícitas, temporales y de solo lectura.
- Webhooks con HMAC SHA-256 y unicidad por evento.
- Bootstrap idempotente y desactivado por marcador.
- Último superadministrador protegido.

## Recuperación de cuentas

1. **Solicitud:** `POST /auth/forgot-password` devuelve siempre el mismo mensaje, exista o no el correo.
2. **Enlace:** token aleatorio de 40 bytes; se guarda su SHA-256, caduca en 30 minutos y es de un solo uso. Se envía por SMTP; sin SMTP queda en bandeja de salida visible para administración.
3. **Restablecimiento:** valida política, revoca todas las sesiones y marca el token como usado.
4. **Administrativo:** genera una contraseña temporal segura, se muestra una sola vez, revoca sesiones y obliga cambio.

## Cambio de correo o propietario

No se permite desde el autorregistro ni por una solicitud anónima. En la beta, el correo de recuperación y el propietario se consideran datos sensibles: cualquier corrección debe hacerse con verificación adicional y auditoría. El panel administrativo no expone un cambio libre de correo; se documenta como proceso de soporte con comprobación de identidad.

## Contraseñas iniciales

Las credenciales de bootstrap se suministran por variables de entorno, no se versionan ni se incluyen en el instalador. El primer acceso exige cambio. El cambio de usuario y contraseña está en **Mi perfil**, con comprobación de la contraseña actual y prevención de nombres duplicados.

## Limitaciones de seguridad

- No se realizó una auditoría externa de seguridad.
- El instalador no está firmado.
- La aplicación web guarda tokens en `localStorage`; un XSS podría exponerlos. La CSP y la validación de entrada reducen superficie, pero se recomienda revisión independiente y, en el futuro, cookies `HttpOnly` con CSRF para la web.
- Los respaldos y la rotación de secretos dependen de la operación del propietario.
- El cifrado en reposo depende de PostgreSQL/volumen del proveedor.

## Respuesta a incidentes

1. Revocar sesiones afectadas y rotar secretos.
2. Aislar la API y preservar evidencia/auditoría.
3. Restaurar en base nueva si hay corrupción.
4. Notificar según obligaciones aplicables.
5. Documentar causa raíz y acciones correctivas.
