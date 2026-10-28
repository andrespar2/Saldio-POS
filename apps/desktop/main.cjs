const { app, BrowserWindow, Menu, ipcMain, protocol, net, shell, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

const APP_VERSION = app.getVersion();
const WEB_DIR = path.join(__dirname, 'web');
const isDev = !app.isPackaged;

app.setName('Saldio POS');
app.setPath('userData', path.join(app.getPath('appData'), 'Saldio POS'));

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'saldio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function resolveWebPath(url) {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(WEB_DIR, relative);
  const root = path.resolve(WEB_DIR) + path.sep;
  if (!target.startsWith(root) && target !== path.resolve(WEB_DIR, 'index.html')) {
    return path.join(WEB_DIR, 'index.html');
  }
  return target;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1220',
    title: 'Saldio POS',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('saldio://app/')) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer terminó inesperadamente', details);
  });

  mainWindow.loadURL('saldio://app/index.html#/login').catch((error) => {
    console.error('No se pudo cargar la interfaz', error);
    dialog.showErrorBox('Saldio POS', 'No se pudo cargar la interfaz local. Reinstale la aplicación.');
  });

  const template = [
    {
      label: 'Saldio POS',
      submenu: [
        { label: `Versión ${APP_VERSION}`, enabled: false },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Saldio POS',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'Saldio POS',
              message: `Saldio POS ${APP_VERSION}`,
              detail:
                'Aplicación de escritorio para operar tiendas conectadas a la API central de Saldio POS. La interfaz no contiene credenciales de base de datos.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('saldio:print', async (_event, payload) => {
  const html = String(payload?.html ?? '');
  const width = String(payload?.width ?? '80');
  if (!html) return false;
  const printWindow = new BrowserWindow({
    show: false,
    width: width === 'a4' ? 900 : width === '58' ? 260 : 340,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const result = await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        (success, failureReason) => {
          if (!success && failureReason) console.error('Impresión:', failureReason);
          resolve(success);
        },
      );
    });
    return result;
  } catch (error) {
    console.error('Error al imprimir', error);
    return false;
  } finally {
    setTimeout(() => printWindow.destroy(), 500);
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.saldio.pos');
    protocol.handle('saldio', (request) => {
      const filePath = resolveWebPath(request.url);
      if (!fs.existsSync(filePath)) {
        return new Response('No encontrado', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
