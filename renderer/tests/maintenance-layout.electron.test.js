'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let window;

async function run() {
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 900, height: 600 });
  await window.loadFile(path.join(__dirname, 'maintenance-layout.fixture.html'));

  async function inspectAt(width, height) {
    // Mô phỏng máy có màn hình 1080p: Electron có thể clamp cửa sổ dưới 2172px.
    window.setSize(Math.min(width, 1904), Math.min(height, 1000));
    await new Promise((resolve) => setTimeout(resolve, 50));
    return window.webContents.executeJavaScript(`(() => {
    const mainContent = document.getElementById('main-content');
    mainContent.style.flex = '0 0 ${width}px';
    mainContent.style.width = '${width}px';

    const header = document.getElementById('tab-header');
    const tabs = document.getElementById('maintenance-tabs');
    const buttons = [...tabs.querySelectorAll('.tab-btn')];
    const headerStyle = getComputedStyle(header);
    const topbar = document.getElementById('topbar');
    const topbarStyle = getComputedStyle(topbar);
    const overlayStyle = getComputedStyle(topbar, '::before');
    const availableWidth = header.clientWidth
      - parseFloat(headerStyle.paddingLeft)
      - parseFloat(headerStyle.paddingRight);

    return {
      availableWidth,
      tabsWidth: tabs.getBoundingClientRect().width,
      buttonWidths: buttons.map((button) => button.getBoundingClientRect().width),
      topbarBackgroundColor: topbarStyle.backgroundColor,
      topbarBackgroundImage: topbarStyle.backgroundImage,
      topbarBackgroundSize: topbarStyle.backgroundSize,
      topbarBackgroundPosition: topbarStyle.backgroundPosition,
      topbarBackgroundRepeat: topbarStyle.backgroundRepeat,
      topbarWidth: topbar.getBoundingClientRect().width,
      overlayBackgroundImage: overlayStyle.backgroundImage,
      overlayContent: overlayStyle.content,
    };
    })()`);
  }

  for (const [width, height] of [[1259, 751], [1366, 768], [1600, 900], [1920, 1080], [2560, 1440]]) {
    const result = await inspectAt(width, height);
    assert.ok(
      Math.abs(result.tabsWidth - result.availableWidth) <= 1,
      `Tabs must fill the card header at ${width}x${height}: ${JSON.stringify(result)}`,
    );
    assert.ok(
      Math.abs(result.buttonWidths[0] - result.buttonWidths[1]) <= 1,
      `Both tabs must have equal width at ${width}x${height}: ${JSON.stringify(result)}`,
    );
    assert.ok(
      Math.abs(result.buttonWidths[0] + result.buttonWidths[1] - result.tabsWidth) <= 1,
      `Tab buttons must fill the tabs row at ${width}x${height}: ${JSON.stringify(result)}`,
    );
    assert.equal(result.topbarBackgroundColor, 'rgba(0, 0, 0, 0)');
    assert.match(result.topbarBackgroundImage, /bg_hckt\.png/);
    assert.equal(result.topbarBackgroundSize, 'min(2172px, 100%)');
    assert.equal(result.topbarBackgroundPosition, '100% 50%');
    assert.equal(result.topbarBackgroundRepeat, 'no-repeat');
    if (width === 2560) {
      assert.ok(
        result.topbarWidth > 2172,
        `Electron must expose a topbar wider than the source image: ${JSON.stringify(result)}`,
      );
    }
    assert.equal(result.overlayBackgroundImage, 'none');
    assert.equal(result.overlayContent, 'none');
  }

  console.log('PASS maintenance tabs and topbar remain correct from 1259x751 through 2560x1440');
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
