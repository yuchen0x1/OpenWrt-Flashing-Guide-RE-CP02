#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const templatePath = process.argv[2] || 'luci/passwall-node-list-enhance/node_list.htm';
const source = fs.readFileSync(templatePath, 'utf8');
const start = source.indexOf('/* ===== ota-enhance:');
const end = source.indexOf('/* ===== ota-enhance end ===== */');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('ota-enhance block not found');
}

const TARGET_KEYS = ['baidu', 'google', 'github', 'instagram'];
const TARGET_URLS = {
  baidu: 'https://www.baidu.com/',
  google: 'https://www.google.com/generate_204',
  github: 'https://github.com/',
  instagram: 'https://www.instagram.com/',
};

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
  otaUrlSlowMs: 1500,
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
  source.slice(start, end).replace(/<%[=-]?[\s\S]*?%>/g, ''),
  context,
  { filename: templatePath },
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

assert(context.otaUrlSlowMs === 1500, 'URL slow threshold constant is 1500 ms');
for (const key of TARGET_KEYS) {
  assert(source.includes(TARGET_URLS[key]), `fixed target URL is declared for ${key}`);
}

assert(context.otaIsSlow(makeRow('r1', { baidu: '1499 ms', google: '1499 ms', github: '1499 ms', instagram: '1499 ms' })) === false, '1499 ms on every target stays under the threshold');
assert(context.otaIsSlow(makeRow('r2', { google: '1500 ms' })) === true, '1500 ms on one target reaches the threshold');
assert(context.otaIsSlow(makeRow('r3', { github: '1501 ms' })) === true, '1501 ms on one target exceeds the threshold');
assert(context.otaIsSlow(makeRow('r4', { baidu: 'Timeout', google: 'Error', github: '---', instagram: 'Timeout' })) === false, 'missing, timeout and error results are retained');

const latencyRow = makeRow('r5', { baidu: '900 ms', google: '400 ms', github: '700 ms', instagram: '---' });
assert(context.otaRowLatency(latencyRow) === 400, 'sorting latency is the lowest explicit target result');
const latencyRowEmpty = makeRow('r6', { baidu: 'Timeout', google: 'Error' });
assert(context.otaRowLatency(latencyRowEmpty) === Infinity, 'rows without any valid target result sort last');

const visible1 = makeRow('v1', { google: '1600 ms' });
const visible2 = makeRow('v2', { google: '1499 ms' });
const visible3 = makeRow('v3', { google: 'Timeout' });
const hiddenRow = makeRow('h1', { google: '2000 ms' });
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

const sortable1 = makeRow('s1', { baidu: '500 ms' });
const sortable2 = makeRow('s2', { baidu: '200 ms' });
const sortable3 = makeRow('s3', { baidu: '---' });
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
context.XHR.requests = [];
context.ota_round_id = 1;
context.otaRunUrlTests(1);
assert(context.XHR.requests.length === 8, 'bounded concurrency caps in-flight URL test requests at 8');
assert(runRows.length * TARGET_KEYS.length === 12, 'task count is node count times four targets');
for (const request of context.XHR.requests) {
  assert(TARGET_KEYS.includes(request.params.target), `every request carries a whitelisted target (got ${request.params.target})`);
}
const pending = context.XHR.requests.slice();
for (const request of pending) {
  if (request.params.id === 'n1') request.callback({ status: 200 }, { use_time: '100' });
  else request.callback(null, null);
}
assert(context.XHR.requests.length === 12, 'remaining queued requests are dispatched as workers free up');
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

const backendDoc = fs.readFileSync('luci/passwall-node-list-enhance/backend-patch.md', 'utf8');
for (const key of TARGET_KEYS) {
  assert(backendDoc.includes(key), `backend patch document whitelists ${key}`);
}
assert(backendDoc.includes('url_test_url') && backendDoc.includes('case "$target" in'), 'backend patch falls back to the global test URL for unknown targets');

console.log('PASS all passwall node-list enhancement behavior checks');
