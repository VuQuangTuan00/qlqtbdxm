'use strict';

const { BrowserWindow, shell } = require('electron');
const path = require('path');
const logger = require('./utils/logger');

/**
 * Tạo cửa sổ chính của ứng dụng
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'QUY TRÌNH CÔNG NGHỆ',
    icon: path.join(__dirname, '../renderer/assets/images/logo_app.png'),
    backgroundColor: '#f0f2f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: process.env.NODE_ENV !== 'production',
      spellcheck: false,
    },
  });

  // Ngăn điều hướng ra ngoài
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = `file://${path.join(__dirname, '../renderer/index.html')}`;
    if (!url.startsWith(appUrl) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Ngăn mở cửa sổ mới
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
    if (process.env.NODE_ENV === 'development') {
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

  return win;
}

/**
 * Tạo cửa sổ con (popup)
 * @param {BrowserWindow} parent
 * @param {Object} options
 * @returns {BrowserWindow}
 */
function createChildWindow(parent, options = {}) {
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
      sandbox: false,
    },
  };

  const win = new BrowserWindow({ ...defaults, ...options });
  win.once('ready-to-show', () => win.show());
  return win;
}

module.exports = { createMainWindow, createChildWindow };
