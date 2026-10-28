# Guía del administrador de plataforma

## Acceso

Los administradores de plataforma usan el mismo inicio de sesión, pero sin seleccionar tienda. Si la cuenta también tiene membresías, el acceso inicial es al panel administrativo; para ver una tienda se usa una **sesión de soporte**.

## Panel

- **Resumen:** tiendas por estado, ingreso mensual estimado según planes activos, tiendas recientes, cola de trabajos y correos pendientes.
- **Tiendas:** búsqueda por nombre, identificación, propietario, correo o teléfono; filtro por estado; ficha completa.
- **Administradores:** creación, rol, permisos, desactivación y restablecimiento temporal. El último superadministrador activo no puede deshabilitarse ni degradarse.
- **Planes:** módulos, límites, precio y estado. Los cambios se auditan y versionan.
- **Auditoría:** acciones administrativas con actor, objeto, motivo y fecha.
- **Operaciones:** salud, latencia, trabajos fallidos, correos e integraciones.
- **Configuración:** aprobación automática de tiendas, correo de soporte y aviso público.

## Ciclo de vida de una tienda

1. **Pendiente:** el autorregistro crea la tienda y el propietario. No puede operar.
2. **Activa:** el administrador aprueba; se crean sucursal, bodega, caja, impuestos, unidades y tareas de onboarding.
3. **Suspendida temporalmente:** requiere motivo. Se revocan sesiones y se bloquean operaciones protegidas. Puede tener fecha de finalización; al vencer, un trabajo auditado la reactiva.
4. **Deshabilitada permanentemente:** requiere motivo. No se reactiva automáticamente; una acción administrativa explícita y auditada puede reactivarla.

No se borran ventas, documentos ni datos contables al suspender o deshabilitar.

## Correcciones y cambios sensibles

- La edición comercial actualiza la ficha, no los comprobantes históricos.
- Cambiar el tipo de negocio exige confirmación si hay variantes o recetas incompatibles y se bloquea si hay pedidos abiertos.
- Cambiar el correo de recuperación o el propietario requiere verificación adicional; no se realiza desde el formulario público ni por una solicitud anónima.
- Cambiar el plan restringe acceso, pero no elimina datos.
- Los documentos confirmados se corrigen con devoluciones o reversiones, nunca con edición destructiva.

## Recuperación de cuentas

- **Enlace:** el usuario solicita recuperación; si hay correo configurado se envía un enlace de un solo uso con caducidad. La respuesta no revela si el correo existe.
- **Administrativa:** genera una contraseña temporal, la muestra una sola vez, revoca sesiones y obliga cambio. No es posible consultar la contraseña actual.
- **Auditoría:** se registra la acción sin guardar el secreto.

## Soporte

La sesión de soporte:

- exige motivo y duración;
- es de **solo lectura**;
- queda auditada;
- muestra un banner visible en la tienda;
- no permite conocer contraseñas ni alterar documentos confirmados;
- se revoca manualmente o al vencer.

## Incidentes

Revise **Operaciones** para trabajos fallidos, errores de integración y correos pendientes. Un trabajo fallido puede reencolarse. Si el fallo es de credenciales, no invente una configuración productiva: permanezca en modo prueba y documente el bloqueo.

## Buenas prácticas

- Use cuentas nominales; no comparta credenciales.
- Mantenga al menos dos superadministradores activos.
- Revise la auditoría tras cada incidente.
- No use soporte para operar la tienda de forma rutinaria.
- Programe y pruebe respaldos antes de cada actualización.
