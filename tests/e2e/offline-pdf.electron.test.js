'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let window;

function createOnePagePdf() {
  const stream = 'BT /F1 18 Tf 30 100 Td (Offline PDF) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii').toString('base64');
}

async function run() {
  await app.whenReady();
  const cspErrors = [];
  window = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('console-message', (_event, _level, message) => {
    if (/content security policy|refused to load/i.test(message)) cspErrors.push(message);
  });

  await window.loadFile(path.resolve(__dirname, '../../renderer/index.html'));
  const result = await window.webContents.executeJavaScript(`(async () => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/vendor/pdfjs/pdf.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Local pdf.js did not load'));
        document.head.appendChild(script);
      });
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
    const raw = atob('${createOnePagePdf()}');
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    const documentHandle = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await documentHandle.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < image.length; index += 4) {
      if (image[index] !== 0) nonTransparentPixels += 1;
    }
    await documentHandle.destroy();
    return {
      version: window.pdfjsLib.version,
      pages: documentHandle.numPages,
      width: canvas.width,
      height: canvas.height,
      nonTransparentPixels,
    };
  })()`);

  assert.equal(result.version, '3.11.174');
  assert.equal(result.pages, 1);
  assert.ok(result.width > 0 && result.height > 0);
  assert.ok(result.nonTransparentPixels > 0);
  assert.deepEqual(cspErrors, []);
  console.log('PASS local PDF.js loads its worker and renders a page without CSP violations');
}

run()
  .then(() => {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error.stack || error);
    if (window && !window.isDestroyed()) window.destroy();
    app.exit(1);
  });
