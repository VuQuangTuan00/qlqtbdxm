'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('PDF preview exposes a visible canvas and a default-open thumbnail panel', () => {
  const source = read('renderer/js/components/pdf-preview-modal.js');
  const css = read('renderer/assets/css/app-theme.css');

  assert.doesNotMatch(source, /\/\/\s*<div class="pdf-file-name"/);
  assert.match(source, /id="pdf-toggle-thumbnails"[^>]+aria-expanded="true"/);
  assert.match(source, /aria-controls="pdf-thumbnail-panel"/);
  assert.match(source, /id="pdf-thumbnail-panel" class="pdf-thumbnail-panel is-open"/);
  assert.match(source, /class="pdf-viewer-body"/);
  assert.match(source, /id="pdf-thumbnail-list"/);

  assert.match(source, /async function renderThumbnails\(\)/);
  assert.match(source, /async function _fitScale\(\)/);
  assert.match(source, /pdfDoc = await[\s\S]*await _fitScale\(\);\s*renderThumbnails\(\);/);
  assert.match(source, /className = 'pdf-thumbnail-item'/);
  assert.match(source, /thumbnail\.dataset\.page/);
  assert.match(source, /canvas\.classList\.add\('is-visible'\)/);
  assert.doesNotMatch(source, /canvas\.style\.display\s*=/);

  assert.match(css, /\.pdf-canvas\.is-visible\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.pdf-thumbnail-panel\.is-open\s*\{/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*\.pdf-thumbnail-panel\s*\{[\s\S]*position:\s*absolute/);
});

test('upload opts into an accessible modal loading state', () => {
  const modalSource = read('renderer/js/components/modal.js');
  const maintenanceSource = read('renderer/pages/maintenance/maintenance-steps.js');
  const css = read('renderer/assets/css/app-theme.css');

  assert.match(modalSource, /btn\.loadingText/);
  assert.match(modalSource, /modalEl\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(modalSource, /footerButtons[\s\S]*button\.disabled = true/);
  assert.match(modalSource, /className = 'modal-action-loading-spinner'/);
  assert.match(modalSource, /await btn\.action\(close\)/);
  assert.match(maintenanceSource, /loadingText:\s*'Đang tải lên…'/);
  assert.match(css, /\.modal-action-loading-spinner\s*\{/);
});

test('PDF delete confirmation stays above the viewer and closes only after success', () => {
  const previewSource = read('renderer/js/components/pdf-preview-modal.js');
  const maintenanceSource = read('renderer/pages/maintenance/maintenance-steps.js');
  const css = read('renderer/assets/css/app-theme.css');

  assert.match(previewSource, /document\.body\.classList\.add\('pdf-preview-open'\)/);
  assert.match(previewSource, /document\.body\.classList\.remove\('pdf-preview-open'\)/);
  assert.match(previewSource, /deleteButton\.disabled = true/);
  assert.match(previewSource, /const deleted = await onDelete\(\)/);
  assert.match(previewSource, /if \(deleted\) \{\s*close\(\)/s);

  assert.match(css, /\.pdf-preview-open #modal-container \.modal-overlay\s*\{[^}]*z-index:\s*10001/s);
  assert.match(maintenanceSource, /if \(!confirmed\) return false;/);
  assert.match(maintenanceSource, /if \(delRes\.success\)[\s\S]*return true;/);
  assert.match(maintenanceSource, /toast\.error\('Lỗi', delRes\.error\);\s*return false;/);
});

