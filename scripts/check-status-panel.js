#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const menu = JSON.parse(fs.readFileSync(path.join(root, 'luci-app-status-panel/root/usr/share/luci/menu.d/luci-app-status-panel.json'), 'utf8'));
const viewPath = Object.values(menu)[0].action.path;
const source = fs.readFileSync(path.join(root, 'luci-app-status-panel/root/www/luci-static/resources/view', viewPath + '.js'), 'utf8');
const api = vm.runInNewContext('(function() {' + source.replace('return view.extend({', 'view.extend({') + '\nreturn { trafficRatesFromPorts, cpuUsageFromStat, pickPorts }; })()', {
  rpc: { declare: () => () => Promise.resolve({}) }, view: { extend: object => object }
});
function ports(rx, tx, name = 'wan') {
  return [{ dev: name, info: { statistics: { rx_bytes: rx, tx_bytes: tx } } }];
}

test('吞吐按照实际采样间隔计算，后台标签节流不放大速率', () => {
  const first = api.trafficRatesFromPorts(null, ports(1000, 2000), 10000);
  assert.equal(first.rx, null);
  const regular = api.trafficRatesFromPorts(first.sample, ports(6000, 12000), 15000);
  assert.equal(regular.rx, 1000);
  assert.equal(regular.tx, 2000);
  const delayed = api.trafficRatesFromPorts(first.sample, ports(61000, 122000), 70000);
  assert.equal(delayed.rx, 1000);
  assert.equal(delayed.tx, 2000);
});

test('RPC 失败或缺少计数时清除基线，恢复后不出现累计流量尖峰', () => {
  const first = api.trafficRatesFromPorts(null, ports(1000, 2000), 10000);
  for (const missing of [[], [{ dev: 'wan', info: {} }], ports(NaN, 1), ports('1000', 1)]) {
    const failed = api.trafficRatesFromPorts(first.sample, missing, 15000);
    assert.equal(failed.sample, null);
    assert.equal(failed.rx, null);
    assert.equal(api.trafficRatesFromPorts(failed.sample, ports(900000, 900000), 20000).rx, null);
  }
});

test('设备集合变化、计数清零和时钟回退后重新采样', () => {
  const first = api.trafficRatesFromPorts(null, ports(1000, 2000), 10000);
  for (const [current, timestamp] of [[ports(11000, 22000, 'eth0'), 15000], [ports(0, 0), 15000], [ports(11000, 22000), 10000], [ports(11000, 22000), 9000]]) {
    const result = api.trafficRatesFromPorts(first.sample, current, timestamp);
    assert.equal(result.rx, null);
    assert.equal(result.tx, null);
    assert.ok(result.sample);
  }
});

test('多口计数汇总不受 API 返回顺序改变影响', () => {
  const firstPorts = ports(1000, 2000, 'wan').concat(ports(3000, 4000, 'lan1'));
  const first = api.trafficRatesFromPorts(null, firstPorts, 10000);
  const nextPorts = ports(8000, 14000, 'lan1').concat(ports(6000, 12000, 'wan'));
  const next = api.trafficRatesFromPorts(first.sample, nextPorts, 15000);
  assert.equal(next.rx, 2000);
  assert.equal(next.tx, 4000);
});

test('CPU 差分不重复统计 guest，DSA 端口优先于 eth 回退', () => {
  assert.equal(api.cpuUsageFromStat('cpu 100 0 0 100 0 0 0 0 50 0', 'cpu 150 0 0 150 0 0 0 0 100 0'), 50);
  assert.equal(api.cpuUsageFromStat('', 'cpu 1 2'), null);
  assert.equal(api.pickPorts({ wan: {}, eth0: {} })[0].dev, 'wan');
  assert.equal(api.pickPorts({ eth0: {} })[0].dev, 'eth0');
});
