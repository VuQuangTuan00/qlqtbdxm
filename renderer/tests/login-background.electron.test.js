'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let window;

async function run() {
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 900, height: 600 });
  await window.loadFile(path.join(__dirname, 'login-background.fixture.html'));

  const initial = await window.webContents.executeJavaScript(`(() => {
    const bodyStyle = getComputedStyle(document.body);
    const overlayStyle = getComputedStyle(document.body, '::before');
    const button = document.getElementById('login-button');
    const buttonRect = button.getBoundingClientRect();

    return {
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundImage: bodyStyle.backgroundImage,
      bodyBackgroundSize: bodyStyle.backgroundSize,
      overlayBackgroundImage: overlayStyle.backgroundImage,
      buttonCenter: {
        x: Math.round(buttonRect.left + buttonRect.width / 2),
        y: Math.round(buttonRect.top + buttonRect.height / 2),
      },
    };
  })()`);

  window.webContents.sendInputEvent({
    type: 'mouseMove',
    x: initial.buttonCenter.x,
    y: initial.buttonCenter.y,
  });

  await new Promise((resolve) => setTimeout(resolve, 400));

  const hoveredButton = await window.webContents.executeJavaScript(`(() => {
    const style = getComputedStyle(document.getElementById('login-button'));
    return {
      backgroundImage: style.backgroundImage,
      color: style.color,
      boxShadow: style.boxShadow,
    };
  })()`);

  assert.equal(initial.bodyBackgroundColor, 'rgb(247, 251, 252)');
  assert.equal(
    (initial.bodyBackgroundImage.match(/linear-gradient/g) || []).length,
    2,
    `Login background must use a two-axis square grid: ${JSON.stringify(initial)}`,
  );
  assert.equal(initial.bodyBackgroundSize, '40px 40px, 40px 40px');
  assert.match(initial.overlayBackgroundImage, /radial-gradient/);
  assert.doesNotMatch(initial.overlayBackgroundImage, /rgba\(15, 26, 15, 0\.8\)/);

  assert.match(hoveredButton.backgroundImage, /rgb\(61, 122, 80\)/);
  assert.match(hoveredButton.backgroundImage, /rgb\(201, 168, 76\)/);
  assert.equal(hoveredButton.color, 'rgb(15, 26, 15)');
  assert.match(hoveredButton.boxShadow, /rgba\(201, 168, 76, 0\.3\)/);

  console.log('PASS login background matches the light grid palette and button hover is preserved');
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
