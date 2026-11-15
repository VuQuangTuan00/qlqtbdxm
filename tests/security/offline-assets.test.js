'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const renderer = path.join(root, 'renderer');

test('renderer CSP and runtime source have no required remote asset origins', () => {
  const index = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const layout = fs.readFileSync(path.join(renderer, 'assets/css/layout.css'), 'utf8');
  const pdfViewer = fs.readFileSync(path.join(renderer, 'js/components/pdf-preview-modal.js'), 'utf8');

  assert.doesNotMatch(index, /https?:\/\//i);
  assert.doesNotMatch(layout, /@import\s+url\(['"]?https?:\/\//i);
  assert.doesNotMatch(pdfViewer, /https?:\/\//i);
  assert.match(index, /script-src 'self';/);
  assert.match(index, /font-src 'self';/);
});

test('all local PDF.js and WOFF2 assets referenced by the renderer exist', () => {
  const expectedFiles = [
    'assets/vendor/pdfjs/pdf.min.js',
    'assets/vendor/pdfjs/pdf.worker.min.js',
    'assets/vendor/pdfjs/LICENSE',
    ...['vietnamese', 'latin-ext', 'latin'].map((subset) => `assets/fonts/oswald-${subset}-variable.woff2`),
    ...[300, 400, 500, 600].flatMap((weight) => [
      `assets/fonts/barlow-vietnamese-${weight}-normal.woff2`,
      `assets/fonts/barlow-latin-ext-${weight}-normal.woff2`,
      `assets/fonts/barlow-latin-${weight}-normal.woff2`,
    ]),
    'assets/fonts/OFL-Barlow.txt',
    'assets/fonts/OFL-Oswald.txt',
  ];

  for (const relativePath of expectedFiles) {
    assert.equal(fs.existsSync(path.join(renderer, relativePath)), true, relativePath);
  }

  const layout = fs.readFileSync(path.join(renderer, 'assets/css/layout.css'), 'utf8');
  assert.match(layout, /font-family:\s*['"]Oswald['"][\s\S]*?font-weight:\s*400 700/);
  for (const weight of [300, 400, 500, 600]) {
    assert.match(layout, new RegExp(`font-family:\\s*['"]Barlow['"][\\s\\S]*?font-weight:\\s*${weight}`));
  }

  for (const relativePath of expectedFiles.filter((file) => file.endsWith('.woff2'))) {
    const signature = fs.readFileSync(path.join(renderer, relativePath)).subarray(0, 4).toString('ascii');
    assert.equal(signature, 'wOF2', relativePath);
  }

  const pdfJs = fs.readFileSync(path.join(renderer, 'assets/vendor/pdfjs/pdf.min.js'), 'utf8');
  const pdfWorker = fs.readFileSync(path.join(renderer, 'assets/vendor/pdfjs/pdf.worker.min.js'), 'utf8');
  assert.match(pdfJs, /3\.11\.174/);
  assert.match(pdfWorker, /3\.11\.174/);
});

