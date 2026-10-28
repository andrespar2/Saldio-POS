# ADR 004 · Electron en lugar de Tauri

- **Estado:** aceptado con revisión futura.
- **Contexto:** se necesita una aplicación Windows que use el mismo backend, imprima comprobantes y se distribuya con instalador. El equipo dispone de Node.js, pero no de toolchain Rust/MSVC; Tauri requeriría instalar y mantener ese toolchain y WebView2 tiene comportamiento de impresión variable.
- **Decisión:** usar Electron con `contextIsolation`, `sandbox`, protocolo propio `saldio://app`, preload mínimo y `electron-builder` NSIS x64. La UI web se empaqueta; la API se configura por HTTPS. La impresión usa una ventana oculta con el HTML del comprobante.
- **Consecuencias:** mayor tamaño del instalador y consumo de memoria que Tauri. A cambio, impresión consistente, distribución inmediata y menor riesgo de bloqueo por toolchain. El instalador actual no está firmado. Se puede migrar a Tauri si se incorpora el toolchain y se valida la impresión térmica.
