'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const menu = JSON.parse(fs.readFileSync(path.join(root, 'luci-app-plugin-hub/root/usr/share/luci/menu.d/luci-app-plugin-hub.json')));
const viewPath = Object.values(menu)[0].action.path;
const source = fs.readFileSync(path.join(root, 'luci-app-plugin-hub/root/www/luci-static/resources/view', viewPath + '.js'), 'utf8');
function sandbox(exec, list = async () => [], serviceList = async () => ({})) {
  const notifications = [];
  const context = vm.createContext({ fs: { exec, list }, rpc: { declare: () => serviceList }, view: { extend: object => object }, L: { url: value => '/cgi-bin/luci/' + value, resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback) }, window: { confirm: () => true, location: { protocol: 'https:', hostname: '192.168.8.1' } }, _: text => text, E: (tag, attrs, text) => ({ text }), ui: { addNotification: (_, el) => notifications.push(el.text) } });
  vm.runInContext('(function() {' + source.replace('return view.extend(', 'this.exported = view.extend(') + '; this.api = { runAction, itemStatus, hubUrl }; }).call(this);', context);
  return { ...context.api, view: context.exported, notifications };
}
const item = { init: 'transmission' };
function event() { return { currentTarget: { disabled: false, textContent: '启动' }, preventDefault() {}, stopPropagation() {} }; }
test('非零退出与缺失退出码不会报告成功；按钮恢复并刷新', async () => {
  for (const reply of [{ code: 1 }, {}]) {
    const api = sandbox(async () => reply);
    const ev = event();
    let refreshed = 0;
    await api.runAction(ev, item, 'start', () => { refreshed++; });
    assert.match(api.notifications[0], /操作失败/);
    assert.equal(ev.currentTarget.disabled, false);
    assert.equal(refreshed, 1);
  }
});
test('成功退出报告成功；同一服务并发操作只执行一次', async () => {
  let finish, calls = 0;
  const api = sandbox(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = api.runAction(event(), item, 'start');
  await api.runAction(event(), item, 'restart');
  assert.equal(calls, 1);
  finish({ code: 0 });
  await pending;
  assert.match(api.notifications[0], /已执行/);
});
test('RPC 错误及刷新失败都有提示，不产生未处理拒绝', async () => {
  const api = sandbox(async () => { throw new Error('rpc denied'); });
  await api.runAction(event(), item, 'start', async () => { throw new Error('refresh'); });
  assert.match(api.notifications[0], /操作失败/);
  assert.match(api.notifications[1], /状态刷新失败/);
});
test('仅 procd 的 running 实例标记为运行中', () => {
  const api = sandbox(async () => ({}));
  assert.equal(api.itemStatus(item, { transmission: true }, { transmission: { instances: { main: { running: false } } } }).text, '已停止');
  assert.equal(api.itemStatus(item, { transmission: true }, { transmission: { instances: { main: { running: true } } } }).text, '运行中');
  assert.equal(api.itemStatus(item, {}, {}).text, '未安装');
  assert.equal(api.itemStatus(item, null, null), null);
});
test('只读权限仅探测状态；写权限仅允许卡片服务的三种操作', () => {
  const acl = JSON.parse(fs.readFileSync(path.join(root, 'luci-app-plugin-hub/root/usr/share/rpcd/acl.d/luci-app-plugin-hub.json'), 'utf8'))['plugin-hub'];
  assert.ok(acl.read.ubus.file.includes('list'));
  assert.ok(!acl.read.ubus.file.includes('exec'));
  assert.ok(!Object.values(acl.read.file).some(permissions => permissions.includes('exec')));
  const serviceNames = [...new Set([...source.matchAll(/\binit: '([^']+)'/g)].map(match => match[1]))];
  const allowed = Object.keys(acl.write.file);
  assert.equal(allowed.length, serviceNames.length * 3);
  for (const service of serviceNames) {
    for (const action of ['start', 'stop', 'restart']) {
      assert.deepEqual(acl.write.file['/etc/init.d/' + service + ' ' + action], ['exec']);
    }
  }
  assert.ok(!allowed.some(command => command.includes('*')));
});
test('HTTPS LuCI 下的独立端口仍使用服务实际 HTTP 协议', () => {
  const api = sandbox(async () => ({ code: 0 }));
  assert.equal(api.hubUrl({ port: 9091, path: '/transmission/' }), 'http://192.168.8.1:9091/transmission/');
  assert.equal(api.hubUrl({ port: 8989, path: '/', protocol: 'https:' }), 'https://192.168.8.1:8989/');
  assert.equal(api.hubUrl({ href: 'admin/services/transmission', internal: true }), '/cgi-bin/luci/admin/services/transmission');
});
test('init 目录探测被拒绝时保留未知状态，不误报为全部未安装', async () => {
  const api = sandbox(async () => ({ code: 0 }), async () => { throw new Error('permission denied'); });
  const [initd, services] = await api.view.load();
  assert.equal(initd, null);
  assert.equal(api.itemStatus(item, initd, services), null);
});
