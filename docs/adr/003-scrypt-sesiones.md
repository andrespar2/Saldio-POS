# ADR 003 · Contraseñas y sesiones

- **Estado:** aceptado.
- **Contexto:** se requiere hash seguro sin dependencias nativas frágiles en Windows y sesiones revocables.
- **Decisión:** usar `scrypt` de Node.js con N=16384, r=8, p=1, salt aleatorio de 16 bytes y clave de 64 bytes, formato versionado `scrypt$N$r$p$salt$hash`. Access JWT de vida corta (15 min por defecto) y refresh token aleatorio de 48 bytes almacenado solo como hash SHA-256. El refresh rota y la reutilización revoca todas las sesiones del usuario.
- **Consecuencias:** no se almacenan contraseñas ni refresh tokens en claro. El coste de scrypt es deliberado. La revocación de sesiones es inmediata en la siguiente solicitud. Los tokens se guardan en el cliente; no se usan cookies, por lo que CSRF no aplica a la API bearer, y se recomienda HTTPS en producción.
