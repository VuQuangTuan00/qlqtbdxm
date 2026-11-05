'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'renderer');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function filesUnder(directory, extensions) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(absolute, extensions));
    else if (extensions.has(path.extname(entry.name))) result.push(absolute);
  }
  return result.sort();
}

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('protected login HTML remains byte-equivalent', () => {
  const html = read('renderer/index.html');
  const fragment = extractBetween(html, '<div id="login-screen">', '<!-- App shell -->');
  assert.equal(sha256(fragment), '14cd1ee96febfb8bd80e9c8565692aa5501cc8ac1a7525bec54eb085e4c41836');
});

test('protected login and body CSS remains byte-equivalent', () => {
  const css = read('renderer/assets/css/layout.css');
  const prefix = css.slice(0, css.indexOf('/* ===== APP SHELL (after login) ===== */'));
  assert.equal(sha256(prefix), '1408621c6e4fcbfac8eaf958ef3acfc938cad30e6ce82e9c849b899e6fc64ed8');
});

test('typography declarations remain byte-equivalent', () => {
  const cssFiles = [
    'renderer/assets/css/variables.css',
    'renderer/assets/css/base.css',
    'renderer/assets/css/layout.css',
    'renderer/assets/css/components.css',
  ];
  const declarations = cssFiles.flatMap((file) => read(file)
    .split(/\r?\n/)
    .filter((line) => /@import|@font-face|font-family|font-size|font-weight|letter-spacing|text-transform/.test(line))
    .map((line) => `${file}::${line}`));
  assert.equal(sha256(declarations.join('\n')), '2ea862871d4778d2d7ed3cc551642c340b730b702a34740f39d37c21156835e7');
});

test('existing external URL set is unchanged and no URL is added', () => {
  const urls = new Set();
  const rendererTests = path.join(RENDERER, 'tests') + path.sep;
  for (const file of filesUnder(RENDERER, new Set(['.html', '.css', '.js'])).filter((item) => !item.startsWith(rendererTests))) {
    const matches = fs.readFileSync(file, 'utf8').match(/https:\/\/[^\s'"<>]+/g) || [];
    for (const match of matches) urls.add(match.replace(/[);]+$/, ''));
  }
  assert.deepEqual([...urls].sort(), [
    'https://cdnjs.cloudflare.com',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://fonts.googleapis.com',
    'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap',
    'https://fonts.gstatic.com',
  ]);
});

test('all menu routes and protected app IDs remain present', () => {
  const html = read('renderer/index.html');
  const routes = [...html.matchAll(/data-route="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, ['equipment-list', 'plan-list', 'maintenance-steps', 'reports', 'settings']);
  for (const id of ['app', 'sidebar', 'main-content', 'topbar', 'topbar-title', 'btn-logout', 'page-view', 'toast-container', 'modal-container']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('role-based vehicle and plan guards remain present', () => {
  const vehicle = read('renderer/pages/maintenance/maintenance-steps.js');
  const plan = read('renderer/pages/maintenance/plan-detail.js');
  assert.match(vehicle, /function _isAdmin\(\) \{ return store\.hasRole\('admin'\); \}/);
  assert.match(plan, /store\.hasRole\('admin', 'commander'\)/);
  assert.match(plan, /store\.hasRole\('admin', 'commander', 'inspector'\)/);
  assert.match(plan, /store\.hasRole\('admin', 'technician', 'commander'\)/);
});

test('scoped blue app theme is linked after shared component styles', () => {
  const html = read('renderer/index.html');
  const themePath = path.join(RENDERER, 'assets', 'css', 'app-theme.css');
  assert.ok(fs.existsSync(themePath), 'app-theme.css must exist');
  assert.ok(html.indexOf('assets/css/app-theme.css') > html.indexOf('assets/css/components.css'));

  const theme = fs.readFileSync(themePath, 'utf8');
  assert.match(theme, /#app\s*\{/);
  assert.match(theme, /--color-primary:\s*#0B5EA8/i);
  assert.match(theme, /--color-primary-bright:\s*#1E88E5/i);
  assert.match(theme, /--color-primary-soft:\s*#E6F2FB/i);
  assert.match(theme, /--color-primary-border:\s*#B9D7EE/i);
  assert.doesNotMatch(theme, /font-family|font-size|font-weight|letter-spacing|text-transform|@import|@font-face/);
  assert.doesNotMatch(theme, /#4a7c59|#c9a84c|#1a1a1a/i);
});

test('app shell uses local SVG icons and branded image-backed shell', () => {
  const html = read('renderer/index.html');
  const theme = read('renderer/assets/css/app-theme.css');
  assert.doesNotMatch(html, /<Tarea>/i);
  assert.match(html, /class="topbar-brand"/);
  assert.match(html, /class="topbar-brand-logo"[^>]*logo_app\.png/);
  assert.ok((html.match(/class="nav-item-icon"/g) || []).length >= 5);
  assert.ok((html.match(/<svg[^>]*aria-hidden="true"/g) || []).length >= 6);
  assert.match(theme, /banner_sidebar\.png/);
  assert.match(theme, /background-position:\s*center bottom/);
  assert.match(theme, /banner_topbar\.png/);
  assert.match(theme, /background-position:\s*right center/);
});

test('post-login presentation uses SVG or local image icons instead of emoji', () => {
  const violations = [];
  const sources = filesUnder(path.join(RENDERER, 'pages'), new Set(['.js']))
    .concat(filesUnder(path.join(RENDERER, 'js', 'components'), new Set(['.js'])));
  for (const file of sources) {
    if (/\p{Extended_Pictographic}/u.test(fs.readFileSync(file, 'utf8'))) {
      violations.push(path.relative(ROOT, file));
    }
  }
  const appShell = read('renderer/index.html').slice(read('renderer/index.html').indexOf('<!-- App shell -->'));
  if (/\p{Extended_Pictographic}/u.test(appShell)) violations.push('renderer/index.html#app-shell');
  assert.deepEqual(violations, []);
});

test('vehicle cards use fixed media ratio, blue title strip and keyboard activation', () => {
  const page = read('renderer/pages/maintenance/maintenance-steps.js');
  const theme = read('renderer/assets/css/app-theme.css');
  assert.match(page, /class="vehicle-card"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(page, /class="vehicle-card-media"/);
  assert.match(page, /class="vehicle-card-title-strip"/);
  assert.match(page, /class="vehicle-card-stats"/);
  assert.match(page, /class="vehicle-card-detail-link"/);
  assert.match(page, /e\.key === 'Enter'.*e\.key === ' '/s);
  assert.doesNotMatch(page, /card\.addEventListener\('mouseover'|card\.addEventListener\('mouseout'/);
  assert.match(theme, /\.vehicle-card-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/s);
  assert.match(theme, /\.vehicle-card-image\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(theme, /\.vehicle-card:focus-visible/);
});

test('shared components expose accessible table, modal and PDF theme hooks', () => {
  const table = read('renderer/js/components/data-table.js');
  const modal = read('renderer/js/components/modal.js');
  const pdf = read('renderer/js/components/pdf-preview-modal.js');
  const theme = read('renderer/assets/css/app-theme.css');
  assert.match(table, /aria-sort/);
  assert.match(table, /tabIndex\s*=\s*0/);
  assert.match(modal, /aria-labelledby/);
  assert.match(theme, /\.modal-sm\s*\{\s*max-width:\s*420px/);
  assert.match(theme, /\.modal-lg\s*\{\s*max-width:\s*760px/);
  assert.match(theme, /\.modal-xl\s*\{\s*max-width:\s*1000px/);
  assert.match(pdf, /class="pdf-toolbar"/);
  assert.match(pdf, /class="pdf-viewer-scroll"/);
  assert.doesNotMatch(pdf, /<style>/);
});

test('app theme includes desktop compact and low-height responsive contracts', () => {
  const theme = read('renderer/assets/css/app-theme.css');
  assert.match(theme, /@media\s*\(max-width:\s*1199px\)/);
  assert.match(theme, /@media\s*\(max-height:\s*699px\)/);
  assert.match(theme, /#app #page-view\s*>\s*\*\s*\{[^}]*max-width:/s);
  assert.match(theme, /#app #page-view\s*\{[^}]*user-select:\s*text/s);
  assert.match(theme, /:focus-visible/);
  assert.match(theme, /\.settings-tabs-scroll/);
  assert.match(theme, /\.vehicle-detail-layout/);
  assert.match(theme, /\.report-stats-grid/);
});

test('renderer page scripts contain no legacy app color references', () => {
  const scriptFiles = filesUnder(path.join(RENDERER, 'pages'), new Set(['.js']))
    .concat(filesUnder(path.join(RENDERER, 'js', 'components'), new Set(['.js'])));
  const violations = [];
  for (const file of scriptFiles) {
    const source = fs.readFileSync(file, 'utf8');
    if (/var\(--color-gold|#4a7c59|#3a6347|#c9a84c|#1a1a1a/i.test(source)) {
      violations.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(violations, []);
});
