'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadWindowManager() {
  const openedExternal = [];
  const windows = [];

  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.webContents = {
        events: new Map(),
        on: (name, handler) => this.webContents.events.set(name, handler),
        setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler; },
        openDevTools() {},
      };
      windows.push(this);
    }
    once(name, handler) { this.events.set(name, handler); }
    on(name, handler) { this.events.set(name, handler); }
    show() {}
    loadFile() { return Promise.resolve(); }
  }

  const electron = {
    BrowserWindow,
    shell: { openExternal(url) { openedExternal.push(url); } },
  };
  const modulePath = require.resolve('../../../main/window-manager');
  const electronPath = require.resolve('electron');
  const savedModule = require.cache[modulePath];
  const savedElectron = require.cache[electronPath];
  delete require.cache[modulePath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electron,
  };
  const manager = require(modulePath);
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];
  if (savedElectron) require.cache[electronPath] = savedElectron;
  else delete require.cache[electronPath];

  return { manager, windows, openedExternal };
}

test('main and child windows keep Electron isolation controls enabled', () => {
  const { manager, windows } = loadWindowManager();
  const main = manager.createMainWindow();
  const child = manager.createChildWindow(main, {
    webPreferences: { nodeIntegration: true, sandbox: false },
  });

  for (const win of windows) {
    assert.equal(win.options.webPreferences.nodeIntegration, false);
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.sandbox, true);
  }
  assert.equal(child.options.parent, main);
});

test('navigation blocks arbitrary local files and opens only http(s) externally', () => {
  const { manager, windows, openedExternal } = loadWindowManager();
  manager.createMainWindow();
  const win = windows[0];
  const navigate = win.webContents.events.get('will-navigate');

  let prevented = false;
  navigate({ preventDefault() { prevented = true; } }, 'file:///C:/Windows/System32/drivers/etc/hosts');
  assert.equal(prevented, true);
  assert.deepEqual(openedExternal, []);

  prevented = false;
  navigate({ preventDefault() { prevented = true; } }, 'https://example.invalid/help');
  assert.equal(prevented, true);
  assert.deepEqual(openedExternal, ['https://example.invalid/help']);

  assert.deepEqual(win.windowOpenHandler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepEqual(openedExternal, ['https://example.invalid/help']);
});

