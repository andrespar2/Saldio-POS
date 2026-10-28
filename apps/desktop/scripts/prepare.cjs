const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'web', 'dist');
const target = path.resolve(__dirname, '..', 'web');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error('Falta apps/web/dist. Ejecute primero npm run build -w @saldio/web.');
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
const iconSource = path.resolve(__dirname, '..', '..', 'web', 'public', 'brand', 'saldio-icon.svg');
if (fs.existsSync(iconSource)) {
  fs.mkdirSync(path.resolve(__dirname, '..', 'build'), { recursive: true });
  fs.copyFileSync(iconSource, path.resolve(__dirname, '..', 'build', 'icon.svg'));
}
console.log('[desktop] Interfaz web copiada a apps/desktop/web');
