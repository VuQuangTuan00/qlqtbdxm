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

  const result = await window.webContents.executeJavaScript(`(() => {
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
      overlayBackgroundImage: overlayStyle.backgroundImage,
      overlayContent: overlayStyle.content,
    };
  })()`);

  assert.ok(
    Math.abs(result.tabsWidth - result.availableWidth) <= 1,
    `Tabs must fill the card header: ${JSON.stringify(result)}`,
  );
  assert.ok(
    Math.abs(result.buttonWidths[0] - result.buttonWidths[1]) <= 1,
    `Both tabs must have equal width: ${JSON.stringify(result)}`,
  );
  assert.ok(
    Math.abs(result.buttonWidths[0] + result.buttonWidths[1] - result.tabsWidth) <= 1,
    `Tab buttons must fill the tabs row: ${JSON.stringify(result)}`,
  );
  assert.equal(result.topbarBackgroundColor, 'rgba(0, 0, 0, 0)');
  assert.match(result.topbarBackgroundImage, /bg_hckt\.png/);
  assert.equal(result.overlayBackgroundImage, 'none');
  assert.equal(result.overlayContent, 'none');

  console.log('PASS maintenance tabs fill their card and topbar image has no dark overlay');
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
