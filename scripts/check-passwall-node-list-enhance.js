#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 默认模板路径按脚本自身位置解析，不依赖调用者的当前工作目录
const templatePath = process.argv[2] || path.join(__dirname, '..', 'luci', 'passwall-node-list-enhance', 'node_list.htm');
const source = fs.readFileSync(templatePath, 'utf8');
const start = source.indexOf('/* ===== ota-enhance:');
const end = source.indexOf('/* ===== ota-enhance end ===== */');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('ota-enhance block not found');
}
const blockSource = source.slice(start, end);

// 阈值与目标列表以被测模板为唯一真源：这里解析而不是再抄一份，
// 否则两侧各改一份就会出现假通过/假失败。
function parseDeclaredConstants(text) {
  const slowMatch = /\bvar\s+otaUrlSlowMs\s*=\s*(\d+)\s*;/.exec(text);
  if (!slowMatch) throw new Error('otaUrlSlowMs is not declared in the template');
  const listMatch = /\bvar\s+otaUrlTargets\s*=\s*\[([\s\S]*?)\];/.exec(text);
  if (!listMatch) throw new Error('otaUrlTargets is not declared in the template');
  const targets = [];
  const entry = /\{\s*key:\s*"([^"]+)"\s*,\s*label:\s*"([^"]*)"\s*,\s*url:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = entry.exec(listMatch[1])) !== null) {
    targets.push({ key: m[1], label: m[2], url: m[3] });
  }
  return { slowMs: Number(slowMatch[1]), targets };
}

const declared = parseDeclaredConstants(source);
const TARGET_KEYS = declared.targets.map((target) => target.key);
const URL_SLOW_MS = declared.slowMs;

function targetSelector(key) {
  return `.pw-urltest-result[data-target="${key}"]`;
}

const rows = [];
let currentRows = [];
let visibleContainer = null;
let tables = [];
const timers = [];

function makeRow(id, urlValues = {}) {
  const cells = {};
  for (const key of TARGET_KEYS) {
    cells[targetSelector(key)] = { textContent: urlValues[key] || '---' };
  }
  const checkbox = { checked: false };
  const row = {
    id: `cbi-passwall-${id}`,
    parentNode: null,
    querySelector(selector) {
      if (selector === '.nodes_select') return checkbox;
      return cells[selector] || null;
    },
    checkbox,
    cells,
  };
  rows.push(row);
  return row;
}

const context = {
  otaUrlTargets: TARGET_KEYS.map((key) => ({ key })),
  otaUrlSlowMs: URL_SLOW_MS,
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  },
  localStorage: {
    length: 0,
    key: () => null,
    removeItem: () => {},
  },
  timers,
  setTimeout(callback) {
    timers.push(callback);
    return timers.length;
  },
  clearTimeout() {},
  console,
};
context.XHR = {
  requests: [],
  get(url, params, callback) {
    this.requests.push({ url, params, callback });
  },
};
vm.createContext(context);
vm.runInContext(
  blockSource.replace(/<%[=-]?[\s\S]*?%>/g, ''),
  context,
  { filename: templatePath },
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

assert(TARGET_KEYS.length >= 3, `template declares several url-test targets (${TARGET_KEYS.length})`);
assert(new Set(TARGET_KEYS).size === TARGET_KEYS.length, 'declared target keys are unique');
for (const target of declared.targets) {
  assert(/^https:\/\//.test(target.url), `declared target ${target.key} uses an https URL`);
}
assert(URL_SLOW_MS >= 200 && URL_SLOW_MS <= 10000, `declared threshold stays in a sane range (${URL_SLOW_MS} ms)`);
assert(context.otaUrlSlowMs === URL_SLOW_MS, 'runtime threshold equals the template declaration');
assert(/value\s*>=\s*otaUrlSlowMs/.test(blockSource), 'threshold comparison reads otaUrlSlowMs instead of a numeric literal');
assert(!/[<>]=?\s*\d{4,}\b/.test(blockSource), 'enhance block compares against no hardcoded millisecond literal');
for (const literal of blockSource.match(/\d{3,}\s*ms/g) || []) {
  assert(Number(literal.match(/\d+/)[0]) === URL_SLOW_MS, `millisecond copy "${literal.trim()}" matches the declared threshold`);
}

const underMs = `${URL_SLOW_MS - 1} ms`;
const atMs = `${URL_SLOW_MS} ms`;
const overMs = `${URL_SLOW_MS + 1} ms`;
const [KEY_PRIMARY, KEY_SECOND, KEY_THIRD] = TARGET_KEYS;
const underAll = {};
for (const key of TARGET_KEYS) underAll[key] = underMs;
assert(context.otaIsSlow(makeRow('r1', underAll)) === false, `${underMs} on every declared target stays under the threshold`);
assert(context.otaIsSlow(makeRow('r2', { [KEY_SECOND]: atMs })) === true, `${atMs} on one target reaches the threshold`);
assert(context.otaIsSlow(makeRow('r3', { [KEY_THIRD]: overMs })) === true, `${overMs} on one target exceeds the threshold`);
assert(context.otaIsSlow(makeRow('r4', { [KEY_PRIMARY]: 'Timeout', [KEY_SECOND]: 'Error', [KEY_THIRD]: '---' })) === false, 'missing, timeout and error results are retained');

const latencyRow = makeRow('r5', { [KEY_PRIMARY]: '900 ms', [KEY_SECOND]: '400 ms', [KEY_THIRD]: '700 ms' });
assert(context.otaRowLatency(latencyRow) === 400, 'sorting latency is the lowest explicit target result');
const latencyRowEmpty = makeRow('r6', { [KEY_PRIMARY]: 'Timeout', [KEY_SECOND]: 'Error' });
assert(context.otaRowLatency(latencyRowEmpty) === Infinity, 'rows without any valid target result sort last');

const visible1 = makeRow('v1', { [KEY_SECOND]: `${URL_SLOW_MS + 100} ms` });
const visible2 = makeRow('v2', { [KEY_SECOND]: underMs });
const visible3 = makeRow('v3', { [KEY_SECOND]: 'Timeout' });
const hiddenRow = makeRow('h1', { [KEY_SECOND]: `${URL_SLOW_MS + 500} ms` });
currentRows = [visible1, visible2, visible3];
visibleContainer = { querySelectorAll: () => currentRows };
context.document.querySelector = () => visibleContainer;
let selectStateUpdates = 0;
context.update_select_state = () => { selectStateUpdates += 1; };
assert(context.otaSelectSlow() === 1, 'only current group explicit outliers are selected');
assert(visible1.checkbox.checked === true, 'current group threshold outlier selected');
assert(visible2.checkbox.checked === false, 'threshold equality remains unselected');
assert(visible3.checkbox.checked === false, 'timeout result is not selected');
assert(hiddenRow.checkbox.checked === false, 'hidden group is not selected');
assert(selectStateUpdates === 1, 'selection state is updated once');

const sortable1 = makeRow('s1', { [KEY_PRIMARY]: '500 ms' });
const sortable2 = makeRow('s2', { [KEY_PRIMARY]: '200 ms' });
const sortable3 = makeRow('s3', { [KEY_PRIMARY]: '---' });
const sortableRows = [sortable1, sortable2, sortable3];
const parent = {
  children: sortableRows.slice(),
  appendChild(row) {
    this.children = this.children.filter((candidate) => candidate !== row);
    this.children.push(row);
    row.parentNode = this;
  },
};
for (const row of sortableRows) row.parentNode = parent;
tables = [{ querySelectorAll: () => sortableRows }];
context.document.querySelectorAll = () => tables;
context.sortNodesByLatency();
assert(parent.children[0] === sortable2, 'sorting places the lowest target latency first');
assert(parent.children[1] === sortable1, 'sorting keeps the higher target latency after it');
assert(parent.children[2] === sortable3, 'sorting places missing target results last');

const runRows = [makeRow('n1'), makeRow('n2'), makeRow('n3')];
context.document.querySelectorAll = (selector) => {
  if (selector === 'tr.cbi-section-table-row') return runRows;
  return tables;
};
const dispatchLoop = /for \(var \w+ = 0; \w+ < (\d+); \w+\+\+\) run\(\);/.exec(blockSource);
assert(dispatchLoop, 'enhance block declares a URL test concurrency cap');
const concurrency = Number(dispatchLoop[1]);
assert(concurrency >= 1 && concurrency <= 16, `declared concurrency cap stays in a sane range (${concurrency})`);
context.XHR.requests = [];
context.ota_round_id = 1;
context.otaRunUrlTests(1);
const taskCount = runRows.length * TARGET_KEYS.length;
assert(taskCount === 12, `task count is node count times declared targets (${runRows.length} x ${TARGET_KEYS.length})`);
assert(context.XHR.requests.length === Math.min(concurrency, taskCount), `bounded concurrency caps in-flight URL test requests at ${concurrency}`);
for (const request of context.XHR.requests) {
  assert(TARGET_KEYS.includes(request.params.target), `every request carries a whitelisted target (got ${request.params.target})`);
}
const pending = context.XHR.requests.slice();
for (const request of pending) {
  if (request.params.id === 'n1') request.callback({ status: 200 }, { use_time: '100' });
  else request.callback(null, null);
}
assert(context.XHR.requests.length === taskCount, 'remaining queued requests are dispatched as workers free up');
for (const request of context.XHR.requests.slice(pending.length)) {
  request.callback({ status: 200 }, { use_time: '100' });
}
assert(runRows[0].cells[targetSelector('baidu')].textContent === '101 ms', 'successful results render per target cell');
assert(!/\d+\s*ms/.test(runRows[1].cells[targetSelector('google')].textContent), 'failed results render the Timeout token without a numeric value');

assert(source.includes('JSON.parse(xhr.responseText)'), 'Ajax JSON uses JSON.parse');
assert(source.includes('target: task.target.key'), 'automatic URL tests send the target key');
assert(source.includes('otaCacheRead') && source.includes('otaCacheWrite'), 'latency cache access is guarded');
assert(source.includes('Array.isArray(result)'), 'node list response is validated');
const deleteHook = source.match(/if \(!confirm\([\s\S]*?\)\) \{[\s\S]*?\}\s*delBtn\.click\(\);/);
assert(deleteHook, 'deletion requires confirmation before invoking the native control');
assert(/\bfunction\s+escapeHtml\s*\(/.test(source), 'template defines an escapeHtml helper');
assert(/\bfunction\s+escapeAttrJs\s*\(/.test(source), 'template defines a JS-string attribute escape helper');
assert(/str \+= escapeHtml\(type\) \+ "：" \+ escapeHtml\(remarks\);/.test(source), 'node remarks and type are HTML-escaped before injection');
assert(/split\("\{\{remarks_val\}\}"\)\.join\(escapeHtml\(o\["remarks"\]\)\)/.test(source), 'hidden remark input values are HTML-escaped');
assert(/split\("\{\{id\}\}"\)\.join\(escapeAttrJs\(o\["\.name"\]\)\)/.test(source), 'section ids are escaped for both attribute and JS-string contexts');
assert(/split\("\{\{group\}\}"\)\.join\(escapeAttrJs\(o\["group"\] \|\| ""\)\)/.test(source), 'node group names are escaped for the row_top onclick context');
assert(!/join\(o\["remarks"\]\)/.test(source), 'raw remarks no longer reach the template unescaped');

const backendDoc = fs.readFileSync(path.join(path.dirname(templatePath), 'backend-patch.md'), 'utf8');
for (const key of TARGET_KEYS) {
  assert(backendDoc.includes(key), `backend patch document whitelists ${key}`);
}
assert(backendDoc.includes('url_test_url') && backendDoc.includes('case "$target" in'), 'backend patch falls back to the global test URL for unknown targets');

console.log('PASS all passwall node-list enhancement behavior checks');
