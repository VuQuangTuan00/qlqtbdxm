'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('startup SQL configuration uses one renderer screen and one IPC event', () => {
  const mainSource = read('main/index.js');
  const preloadSource = read('main/preload.js');
  const htmlSource = read('renderer/index.html');

  assert.equal(fs.existsSync(path.join(root, 'renderer/js/first-run.js')), false);
  assert.doesNotMatch(mainSource, /app:first-run/);
  assert.equal([...mainSource.matchAll(/app:db-setup/g)].length, 2);
  assert.doesNotMatch(preloadSource, /app:first-run/);
  assert.match(preloadSource, /app:db-setup/);
  assert.doesNotMatch(htmlSource, /js\/first-run\.js/);
  assert.equal([...htmlSource.matchAll(/js\/db-setup\.js/g)].length, 1);
});

test('shared SQL setup screen distinguishes first-run from recovery', () => {
  const source = read('renderer/js/db-setup.js');

  assert.match(source, /mode\s*=\s*payload\.mode\s*===\s*['"]recovery['"]/);
  assert.match(source, /mode\s*===\s*['"]recovery['"]/);
  assert.match(source, /Thiết lập kết nối SQL Server lần đầu/);
  assert.match(source, /Không kết nối được cơ sở dữ liệu/);
  assert.match(source, /id="dbs-error"/);
  assert.match(source, /display:\$\{mode === 'recovery' \? 'block' : 'none'\}/);
  assert.match(source, /dbconfig:test/);
  assert.match(source, /dbconfig:set/);
  assert.match(source, /if \(!res\.success\)/);
});

test('recovery values are assigned as DOM properties instead of interpolated markup', () => {
  const source = read('renderer/js/db-setup.js');
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '',
        textContent: '',
        style: {},
        addEventListener() {},
      });
    }
    return elements.get(id);
  };
  const overlay = { id: '', style: {}, innerHTML: '' };
  let setupHandler;
  const context = {
    window: {
      electronAPI: {
        on(channel, handler) {
          assert.equal(channel, 'app:db-setup');
          setupHandler = handler;
        },
        invoke() { throw new Error('not used'); },
      },
    },
    document: {
      createElement: () => overlay,
      body: { appendChild() {} },
      getElementById: element,
    },
  };
  vm.runInNewContext(source, context, { filename: 'renderer/js/db-setup.js' });

  const unsafe = '\"><img src=x onerror=alert(1)>';
  setupHandler({
    mode: 'recovery',
    error: unsafe,
    config: { server: unsafe, port: 1433, database: unsafe, user: unsafe },
  });

  assert.doesNotMatch(overlay.innerHTML, /onerror=alert/);
  assert.equal(element('dbs-error').textContent, unsafe);
  assert.equal(element('dbs-server').value, unsafe);
  assert.equal(element('dbs-port').value, '1433');
  assert.equal(element('dbs-db').value, unsafe);
  assert.equal(element('dbs-user').value, unsafe);
});
