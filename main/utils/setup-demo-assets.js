'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Copy demo assets từ resources vào userData lần đầu chạy.
 * Chỉ copy nếu file chưa tồn tại (không ghi đè file user đã tạo).
 */
async function setupDemoAssets() {
  const { app } = require('electron');
  const resourcesPath = process.resourcesPath;
  const userDataPath  = app.getPath('userData');

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

  let copied = 0;
  let skipped = 0;

  for (const { src, dest } of folders) {
    // Dev mode: folder resources không có demo-assets → bỏ qua
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
