'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadPreload() {
  let exposedApi;
  const listeners = new Map();
  const electron = {
    contextBridge: {
      exposeInMainWorld(_name, api) { exposedApi = api; },
    },
    ipcRenderer: {
      invoke() {},
      on(channel, listener) {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel).add(listener);
      },
      removeListener(channel, listener) {
        listeners.get(channel)?.delete(listener);
      },
    },
  };

  const preloadPath = require.resolve('../../../main/preload');
  const electronPath = require.resolve('electron');
  const savedPreload = require.cache[preloadPath];
  const savedElectron = require.cache[electronPath];
  delete require.cache[preloadPath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electron,
  };

  try {
    require(preloadPath);
  } finally {
    if (savedPreload) require.cache[preloadPath] = savedPreload;
    else delete require.cache[preloadPath];
    if (savedElectron) require.cache[electronPath] = savedElectron;
    else delete require.cache[electronPath];
  }

  return { api: exposedApi, listeners };
}

test('preload off removes the exact wrapped listener registered by on', () => {
  const { api, listeners } = loadPreload();
  const callback = () => {};

  api.on('app:notification', callback);
  assert.equal(listeners.get('app:notification').size, 1);

  api.off('app:notification', callback);
  assert.equal(listeners.get('app:notification').size, 0);
});

test('preload rejects invoke and subscriptions outside its allowlists', async () => {
  const { api, listeners } = loadPreload();

  await assert.rejects(api.invoke('shell:exec', 'whoami'), /không được phép/i);
  api.on('shell:exec', () => {});
  assert.equal(listeners.has('shell:exec'), false);
});

