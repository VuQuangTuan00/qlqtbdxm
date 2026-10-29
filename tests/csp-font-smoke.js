'use strict';

process.env.NODE_ENV = 'test';

const path = require('path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

async function main() {
  await app.whenReady();

  const consoleMessages = [];
  const externalRequests = [];
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      externalRequests.push(details.url);
      callback({ cancel: true });
    }
  );
  ipcMain.handle('auth:getSession', async () => ({ success: true, data: null }));

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, message, line, sourceId });
  });

  try {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    const fontResult = await win.webContents.executeJavaScript(`
      (async () => {
        const requests = [
          ['Oswald', 400], ['Oswald', 500], ['Oswald', 600], ['Oswald', 700],
          ['Barlow', 300], ['Barlow', 400], ['Barlow', 500], ['Barlow', 600],
        ];
        const sample = 'Quy Trình Công Nghệ - tiếng Việt: Đặng Nguyễn ă â ê ô ơ ư';
        const loaded = {};
        for (const [family, weight] of requests) {
          const key = family + '-' + weight;
          const faces = await document.fonts.load(weight + ' 16px "' + family + '"', sample);
          loaded[key] = faces.length;
        }
        await document.fonts.ready;
        return {
          loaded,
          declaredFaces: [...document.fonts].map((face) => ({
            family: face.family,
            weight: face.weight,
            style: face.style,
            status: face.status,
          })),
          computed: {
            body: getComputedStyle(document.body).fontFamily,
            loginTitle: getComputedStyle(document.querySelector('.login-title')).fontFamily,
            loginSubtitle: getComputedStyle(document.querySelector('.login-subtitle')).fontFamily,
          },
        };
      })()
    `, true);

    const cspErrors = consoleMessages.filter(({ message }) =>
      /Content Security Policy|Refused to (?:load|apply|execute).*violates/i.test(message)
    );
    const unloaded = Object.entries(fontResult.loaded).filter(([, count]) => count < 1);
    const oswaldFaces = fontResult.declaredFaces.filter((face) => face.family.replace(/["']/g, '') === 'Oswald');
    const barlowFaces = fontResult.declaredFaces.filter((face) => face.family.replace(/["']/g, '') === 'Barlow');
    const result = {
      externalRequests,
      cspErrors,
      consoleErrors: consoleMessages.filter(({ level }) => level >= 3),
      loadedWeights: fontResult.loaded,
      declaredFontFaces: { Oswald: oswaldFaces.length, Barlow: barlowFaces.length },
      computedFontFamilies: fontResult.computed,
    };
    console.log(JSON.stringify(result, null, 2));

    if (externalRequests.length) throw new Error(`Renderer phát sinh ${externalRequests.length} request Internet`);
    if (cspErrors.length) throw new Error(`Renderer còn ${cspErrors.length} lỗi CSP`);
    if (unloaded.length) throw new Error(`Không tải được font local: ${unloaded.map(([key]) => key).join(', ')}`);
    if (oswaldFaces.length !== 5 || barlowFaces.length !== 12) {
      throw new Error(`Số @font-face không đúng: Oswald=${oswaldFaces.length}, Barlow=${barlowFaces.length}`);
    }
  } finally {
    if (!win.isDestroyed()) win.destroy();
    ipcMain.removeHandler('auth:getSession');
  }
}

main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message);
    app.exit(1);
  });
