'use strict';

const { BrowserWindow, shell, app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const logger = require('./utils/logger');

function isSafeExternalUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch (_) {
    return false;
  }
}

/**
 * Tạo cửa sổ chính của ứng dụng
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const isDevelopment = !app.isPackaged;
  const win = new BrowserWindow({
    // width: 1400,
    // height: 900,
    // minWidth: 1024,
    // minHeight: 600,
    maximizable: true,
    title: 'Hệ Thống Quy Trình Công Nghệ Và Định Mức Kinh Tế - Kỹ Thuật',
    icon: path.join(__dirname, '../renderer/assets/images/logo_app.png'),
    backgroundColor: '#f0f2f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDevelopment,
      // devTools: false,
      spellcheck: false,
    },
      autoHideMenuBar: true,
  });

  // Ngăn điều hướng ra ngoài
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
    const targetDocument = url.split(/[?#]/, 1)[0];
    if (targetDocument === appUrl) return;

    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });

  // Ngăn mở cửa sổ mới
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
    if (isDevelopment) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    logger.info('[Window] Cửa sổ chính đã hiển thị');
  });

  win.on('closed', () => {
    logger.info('[Window] Cửa sổ chính đã đóng');
  });

  const indexPath = path.join(__dirname, '../renderer/index.html');
  win.loadFile(indexPath).catch((err) => {
    logger.error('[Window] Lỗi tải trang:', err);
  });
  win.maximize();
  return win;
}

/**
 * Tạo cửa sổ con (popup)
 * @param {BrowserWindow} parent
 * @param {Object} options
 * @returns {BrowserWindow}
 */
function createChildWindow(parent, options = {}) {
  const isDevelopment = !app.isPackaged;
  const defaults = {
    width: 800,
    height: 600,
    parent,
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDevelopment,
    },
  };

  const win = new BrowserWindow({
    ...defaults,
    ...options,
    webPreferences: {
      ...defaults.webPreferences,
      ...(options.webPreferences || {}),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDevelopment,
    },
  });
  win.once('ready-to-show', () => win.show());
  return win;
}

module.exports = { createMainWindow, createChildWindow };
