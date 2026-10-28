#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'apps/web/public/brand/saldio-icon.svg');
const webBrand = path.join(root, 'apps/web/public/brand');
const desktopBuild = path.join(root, 'apps/desktop/build');
fs.mkdirSync(desktopBuild, { recursive: true });

const pngSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
for (const size of pngSizes) {
  await sharp(source, { density: 512 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(webBrand, `saldio-icon-${size}.png`));
}
await sharp(source, { density: 512 })
  .resize(512, 512)
  .png()
  .toFile(path.join(desktopBuild, 'icon.png'));

const icoBuffers = [];
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  icoBuffers.push(
    await sharp(source, { density: 512 }).resize(size, size).png().toBuffer(),
  );
}
const ico = await pngToIco(icoBuffers);
fs.writeFileSync(path.join(desktopBuild, 'icon.ico'), ico);
fs.writeFileSync(path.join(webBrand, 'saldio-icon.ico'), ico);
// Favicon PNG de respaldo para navegadores.
fs.copyFileSync(
  path.join(webBrand, 'saldio-icon-32.png'),
  path.join(root, 'apps/web/public/favicon.png'),
);
console.log('[icons] PNG, favicon e ICO multirresolución generados.');
