'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadWindowManager(isPackaged = false) {
  const openedExternal = [];
  const windows = [];
  let devToolsOpenCount = 0;

  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.webContents = {
        events: new Map(),
        on: (name, handler) => this.webContents.events.set(name, handler),
        setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler; },
        openDevTools() { devToolsOpenCount += 1; },
      };
      windows.push(this);
    }
    once(name, handler) { this.events.set(name, handler); }
    on(name, handler) { this.events.set(name, handler); }
    show() {}
    maximize() {}
    loadFile() { return Promise.resolve(); }
  }

  const electron = {
    BrowserWindow,
    app: { isPackaged },
    shell: { openExternal(url) { openedExternal.push(url); } },
  };
  const modulePath = require.resolve('../../../main/window-manager');
  const electronPath = require.resolve('electron');
  const loggerPath = require.resolve('../../../main/utils/logger');
  const savedModule = require.cache[modulePath];
  const savedElectron = require.cache[electronPath];
  const savedLogger = require.cache[loggerPath];
  delete require.cache[modulePath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electron,
  };
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { info() {}, warn() {}, error() {} },
  };
  const manager = require(modulePath);
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];
  if (savedElectron) require.cache[electronPath] = savedElectron;
  else delete require.cache[electronPath];
  if (savedLogger) require.cache[loggerPath] = savedLogger;
  else delete require.cache[loggerPath];

  return { manager, windows, openedExternal, getDevToolsOpenCount: () => devToolsOpenCount };
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

test('development state follows app.isPackaged instead of NODE_ENV', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const development = loadWindowManager(false);
    development.manager.createMainWindow();
    assert.equal(development.windows[0].options.webPreferences.devTools, true);
    development.windows[0].events.get('ready-to-show')();
    assert.equal(development.getDevToolsOpenCount(), 1);

    process.env.NODE_ENV = 'development';
    const packaged = loadWindowManager(true);
    packaged.manager.createMainWindow();
    assert.equal(packaged.windows[0].options.webPreferences.devTools, false);
    packaged.windows[0].events.get('ready-to-show')();
    assert.equal(packaged.getDevToolsOpenCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('child window DevTools follow packaged state and cannot be re-enabled by options', () => {
  const packaged = loadWindowManager(true);
  packaged.manager.createChildWindow(null, { webPreferences: { devTools: true } });
  assert.equal(packaged.windows[0].options.webPreferences.devTools, false);

  const development = loadWindowManager(false);
  development.manager.createChildWindow(null);
  assert.equal(development.windows[0].options.webPreferences.devTools, true);
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

