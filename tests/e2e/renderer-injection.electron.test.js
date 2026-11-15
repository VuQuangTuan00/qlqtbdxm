'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let window;

async function run() {
  await app.whenReady();
  window = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadFile(path.resolve(__dirname, '../../renderer/index.html'));

  const payload = '<img src=x data-injected=true>harmless';
  const result = await window.webContents.executeJavaScript(`(() => {
    const payload = ${JSON.stringify(payload)};
    window.toast.show({ type: 'error', title: payload, message: payload, duration: 0 });
    window.modal.confirm({ title: payload, message: payload, sub: payload });
    const toast = document.querySelector('.toast');
    const dialog = document.querySelector('.modal');
    const snapshot = {
      injectedImages: document.querySelectorAll('img[data-injected]').length,
      toastTitle: toast.querySelector('.toast-title').textContent,
      toastMessage: toast.querySelector('.toast-message').textContent,
      modalTitle: dialog.querySelector('.modal-title').textContent,
      modalMessage: dialog.querySelector('.confirm-message').textContent,
      modalSub: dialog.querySelector('.confirm-sub').textContent,
    };
    dialog.querySelector('.modal-footer button').click();
    return snapshot;
  })()`);

  assert.equal(result.injectedImages, 0);
  for (const key of ['toastTitle', 'toastMessage', 'modalTitle', 'modalMessage', 'modalSub']) {
    assert.equal(result[key], payload);
  }
  console.log('PASS renderer notifications contain untrusted text without creating markup');
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
