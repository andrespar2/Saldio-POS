# ADR 001 · Monolito modular

- **Estado:** aceptado.
- **Contexto:** el alcance incluye varios dominios (catálogo, ventas, inventario, restaurante, contabilidad) con un equipo pequeño y despliegue único.
- **Decisión:** usar un monolito modular NestJS con módulos por dominio y un único PostgreSQL.
- **Consecuencias:** transacciones locales simples, menor coste operativo y despliegue reproducible. La separación interna permite extraer un módulo si aparece una necesidad real. No se introducen colas ni microservicios sin necesidad medida.
