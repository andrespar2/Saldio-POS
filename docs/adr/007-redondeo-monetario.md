# ADR 007 · Política monetaria y de redondeo

- **Estado:** aceptado.
- **Contexto:** POS, impuestos y devoluciones deben coincidir entre cliente y servidor sin errores de coma flotante.
- **Decisión:** aritmética decimal con `decimal.js`; almacenamiento PostgreSQL `NUMERIC`; redondeo **mitad hacia arriba a 2 decimales por línea**; impuesto calculado sobre la base después del descuento; cantidades a 3 decimales. El servidor recalcula y es la única fuente de verdad. La web usa la misma función compartida para vista previa.
- **Consecuencias:** las sumas de líneas pueden diferir en centavos de un cálculo global alternativo, pero son reproducibles y documentadas. Los reportes usan los importes persistidos.
