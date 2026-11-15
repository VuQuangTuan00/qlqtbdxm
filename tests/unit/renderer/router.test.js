'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../../renderer/js/router.js'),
  'utf8',
);

function createElement(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    _innerHTML: '',
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') this.children = [];
    },
    get innerHTML() { return this._innerHTML; },
  };
}

function loadRouter() {
  const pageView = createElement();
  const topbarTitle = createElement();
  const warnings = [];
  const errors = [];
  const context = {
    document: {
      getElementById(id) {
        if (id === 'page-view') return pageView;
        if (id === 'topbar-title') return topbarTitle;
        return null;
      },
      createElement,
      createTextNode(text) { return { textContent: String(text) }; },
    },
    store: {
      getSession: () => ({ id: 1 }),
      set() {},
    },
    auth: { showLogin() {} },
    sidebar: { setActive() {} },
    console: {
      warn: (...args) => warnings.push(args),
      error: (...args) => errors.push(args),
    },
    window: {},
  };
  vm.runInNewContext(source, context, { filename: 'router.js' });
  return { router: context.window.router, pageView, topbarTitle, warnings, errors };
}

test('navigate awaits async route render and contains rejected error text safely', async () => {
  const { router, pageView, errors } = loadRouter();
  router.register('broken', {
    title: 'Broken',
    async render() {
      await Promise.resolve();
      throw new Error('<img src=x onerror=alert(1)>');
    },
  });

  await router.navigate('broken');

  assert.equal(errors.length, 1);
  assert.equal(pageView.innerHTML, '');
  assert.equal(pageView.children.length, 1);
  assert.equal(pageView.children[0].className, 'alert alert-danger');
  assert.equal(pageView.children[0].children[1].textContent, '<img src=x onerror=alert(1)>');
});

test('refresh returns the active async navigation promise', async () => {
  const { router } = loadRouter();
  let completed = false;
  router.register('async', {
    async render() {
      await Promise.resolve();
      completed = true;
    },
  });

  await router.navigate('async');
  completed = false;
  await router.refresh();

  assert.equal(completed, true);
});
