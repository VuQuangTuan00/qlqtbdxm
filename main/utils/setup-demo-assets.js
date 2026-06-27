'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Copy demo assets (demo.db + ảnh + PDF) từ resources vào userData lần đầu chạy.
 * Gọi TRƯỚC initDatabase() để demo.db có sẵn khi SQLite mở.
 * Chỉ copy nếu file chưa tồn tại — không ghi đè dữ liệu user đã thay đổi.
 */
async function setupDemoAssets() {
  const { app } = require('electron');
  const resourcesPath = process.resourcesPath;
  const userDataPath  = app.getPath('userData');

  let copied  = 0;
  let skipped = 0;

  /* ── Copy demo.db (pre-built database) ── */
  const srcDb  = path.join(resourcesPath, 'demo-assets', 'demo.db');
  const destDb = path.join(userDataPath, 'demo.db');
  if (fs.existsSync(srcDb)) {
    if (!fs.existsSync(destDb)) {
      fs.copyFileSync(srcDb, destDb);
      copied++;
    } else {
      skipped++;
    }
  }

  /* ── Copy ảnh xe & file PDF ── */
  const folders = [
    {
      src:  path.join(resourcesPath, 'demo-assets', 'vehicle-images'),
      dest: path.join(userDataPath, 'vehicle-images'),
    },
    {
      src:  path.join(resourcesPath, 'demo-assets', 'maintenance-files'),
      dest: path.join(userDataPath, 'maintenance-files'),
    },
  ];

  for (const { src, dest } of folders) {
    if (!fs.existsSync(src)) continue;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    for (const file of fs.readdirSync(src)) {
      const srcFile  = path.join(src, file);
      const destFile = path.join(dest, file);
      if (fs.statSync(srcFile).isDirectory()) continue;
      if (fs.existsSync(destFile)) { skipped++; continue; }
      fs.copyFileSync(srcFile, destFile);
      copied++;
    }
  }

  return { copied, skipped };
}

module.exports = { setupDemoAssets };
