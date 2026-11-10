#!/usr/bin/env node
'use strict';
/*
 * LuCI 更新中心视图的逻辑回归（零依赖，不需路由器）。
 *
 * 用最小桩模拟 LuCI 的 E()/view 生命周期，直接调用视图的 render()，断言：
 *   1. 版本按钮按清单动态生成，且覆盖清单里每个版本（旧代码硬编码 23.05.7，
 *      清单变过之后就是死按钮）
 *   2. 推荐版本带「推荐」标记
 *   3. 清单为空 / 非法 JSON 时给出提示而不是抛异常
 *   4. 输出框与徽标节点存在（页面轮询靠这些 id）
 *
 * 这不是浏览器测试，只验证视图函数在给定数据下的返回结构；真实渲染仍需实机。
 *
 * 用法：node scripts/check-ota-view.js
 *       OTA_VIEW_PATH=<其他视图 js> node scripts/check-ota-view.js   # 用于对比旧版本是否会被抓出
 * 退出码：0 通过  1 失败
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const VIEW = process.env.OTA_VIEW_PATH || path.join(root, 'luci-app-ota-check/root/www/luci-static/resources/view/ota-check/update-center5.js');

function makeElement(tag) {
  return {
    tag,
    children: [],
    attrs: {},
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    style: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelectorAll: () => [],
    setAttribute() {},
    focus() {},
    set innerHTML(value) { this._html = value; if (value === '') this.children = []; },
    get innerHTML() { return this._html || ''; }
  };
}

function createSandbox() {
  const document = {
    head: { appendChild() {} },
    body: { classList: { contains: () => false, add() {}, remove() {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeElement,
    createTextNode: text => ({ text })
  };

  /* LuCI 的 E 是变参形式 E(tag, attrs, ...children)，且会递归展开数组子节点 */
  function E(tag, attrs, ...children) {
    let el;
    if (typeof tag === 'string') {
      el = makeElement(tag);
    } else {
      el = { tag: 'fragment', attrs: {}, children: [], appendChild(c) { this.children.push(c); return c; } };
    }
    if (Array.isArray(attrs)) { children = attrs; attrs = {}; }
    Object.assign(el.attrs, attrs || {});
    const push = child => {
      if (child == null) return;
      if (Array.isArray(child)) { child.forEach(push); return; }
      el.children.push(child);
    };
    children.forEach(push);
    return el;
  }

  return {
    document,
    E,
    L: {
      url: p => '/cgi-bin/luci/' + p,
      resolveDefault: (promise, fallback) => Promise.resolve(fallback),
      bind: (fn, ctx) => fn.bind(ctx)
    },
    _: s => s,
    fs: { read: () => Promise.resolve(''), exec: () => Promise.resolve({}), list: () => Promise.resolve([]) },
    ui: { addNotification() {} },
    rpc: { declare: () => ({}), list: () => Promise.resolve({}) },
    poll: { add() {} },
    view: { extend: o => o },
    baseclass: { extend: o => o },
    window: { location: { hostname: '192.168.1.1', protocol: 'http:' } },
    localStorage: { getItem: () => null, setItem() {} },
    Promise,
    console
  };
}

function loadView() {
  let source = fs.readFileSync(VIEW, 'utf8');
  source = source
    .replace(/^'use strict';/m, '')
    .replace(/^'require [^']+';$/gm, '')
    .replace('return view.extend({', '__view = view.extend({');
  const sandbox = createSandbox();
  sandbox.__view = null;

  const fn = vm.runInNewContext(
    source + '\n__view;',
    sandbox,
    { filename: VIEW, timeout: 5000 }
  );
  if (!fn || typeof fn.render !== 'function') throw new Error('视图未导出 render()');
  return fn;
}

function collectById(node, id, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (node.attrs && node.attrs.id === id) acc.push(node);
  for (const child of node.children || []) collectById(child, id, acc);
  return acc;
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node.text === 'string') return node.text;
  return (node.children || []).map(textOf).join('');
}

const failures = [];
const passes = [];
function check(name, ok, detail) {
  if (ok) { passes.push(name); console.log('PASS ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

function renderWith(manifestJson) {
  const view = loadView();
  return view.render([
    "DISTRIB_ID='ImmortalWrt'\nDISTRIB_RELEASE='24.10.6'\nDISTRIB_DESCRIPTION='ImmortalWrt 24.10.6'",
    'JDCloud RE-CP-02',
    manifestJson
  ]);
}

const manifest = JSON.stringify({
  latest: '24.10.6',
  releases: [
    { version: '24.10.6', recommended: true },
    { version: '25.12.2', recommended: false },
    { version: '23.05.7', recommended: false }
  ]
});

/* 1. 版本按钮按清单生成 */
{
  const node = renderWith(manifest);
  const boxes = collectById(node, 'ota-version-buttons');
  check('渲染出 ota-version-buttons 容器', boxes.length === 1, 'containers=' + boxes.length);

  const buttons = boxes.length ? boxes[0].children.filter(c => c.tag === 'button') : [];
  check('生成 3 个版本按钮（等于清单条目数）', buttons.length === 3, 'buttons=' + buttons.length);

  const labels = buttons.map(textOf);
  const expected = ['24.10.6', '25.12.2', '23.05.7'];
  for (const version of expected) {
    check('版本按钮覆盖清单条目 ' + version, labels.some(t => t.includes(version)), labels.join(' | '));
  }
  check('推荐版本带「推荐」标记', labels.some(t => t.includes('24.10.6') && t.includes('推荐')), labels.join(' | '));
  check('版本按钮按降序排列',
    labels.length === 3 && labels[0].includes('25.12.2') && labels[2].includes('23.05.7'),
    labels.join(' | '));
}

/* 2. 清单增删版本时按钮跟随（防止硬编码复活） */
{
  const custom = JSON.stringify({
    latest: '99.1.1',
    releases: [{ version: '99.1.1', recommended: true }, { version: '88.2.2', recommended: false }]
  });
  const node = renderWith(custom);
  const boxes = collectById(node, 'ota-version-buttons');
  const labels = (boxes[0] ? boxes[0].children.filter(c => c.tag === 'button') : []).map(textOf);
  check('清单换成 99.1.1/88.2.2 后按钮跟随', labels.length === 2 && labels.join(' ').includes('99.1.1') && labels.join(' ').includes('88.2.2'), labels.join(' | '));
  check('不再出现硬编码的 23.05.7', !labels.join(' ').includes('23.05.7'), labels.join(' | '));
}

/* 3. 空清单 / 非法 JSON 不抛异常 */
{
  let ok = true, detail = '';
  try {
    const empty = renderWith(JSON.stringify({ latest: 'x', releases: [] }));
    const boxes = collectById(empty, 'ota-version-buttons');
    const buttons = boxes[0] ? boxes[0].children.filter(c => c.tag === 'button') : [];
    if (buttons.length !== 0) { ok = false; detail = '空清单仍生成按钮'; }
  } catch (e) { ok = false; detail = e.message; }
  check('空清单不生成按钮且不抛异常', ok, detail);

  ok = true; detail = '';
  try {
    const broken = renderWith('{not json');
    const boxes = collectById(broken, 'ota-version-buttons');
    const buttons = boxes[0] ? boxes[0].children.filter(c => c.tag === 'button') : [];
    if (buttons.length !== 0) { ok = false; detail = '非法 JSON 仍生成按钮'; }
  } catch (e) { ok = false; detail = e.message; }
  check('非法 JSON 不抛异常', ok, detail);
}

/* 4. 页面轮询依赖的节点 id 必须在 */
{
  const node = renderWith(manifest);
  check('存在输出框 ota-check-out', collectById(node, 'ota-check-out').length === 1);
  check('存在徽标 ota-check-badge', collectById(node, 'ota-check-badge').length === 1);
  check('存在更新日志容器 ota-changelog', collectById(node, 'ota-changelog').length === 1);
  check('存在更新源选择 ota-source', collectById(node, 'ota-source').length === 1);
}

/* 5. 更新日志按版本降序、且渲染 notes */
{
  const withNotes = JSON.stringify({
    latest: '24.10.6',
    generated: '2026-10-07',
    releases: [
      { version: '23.05.7', notes: ['旧分支'] },
      { version: '24.10.6', notes: ['新分支说明一', '新分支说明二'] }
    ]
  });
  const node = renderWith(withNotes);
  const box = collectById(node, 'ota-changelog')[0];
  const flat = textOf(box);
  check('更新日志渲染了 notes 文本', flat.includes('新分支说明一') && flat.includes('旧分支'), flat.slice(0, 80));
  const posNew = flat.indexOf('24.10.6');
  const posOld = flat.indexOf('23.05.7');
  check('更新日志按版本降序（新版本在前）', posNew >= 0 && posOld > posNew, 'posNew=' + posNew + ' posOld=' + posOld);
}

console.log('\nSUMMARY pass=' + passes.length + ' fail=' + failures.length);
if (failures.length) process.exit(1);
