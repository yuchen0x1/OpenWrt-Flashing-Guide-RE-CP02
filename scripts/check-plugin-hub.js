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
function sandbox(exec) {
  const notifications = [];
  const context = vm.createContext({ fs: { exec }, rpc: { declare: () => () => {} }, view: { extend: () => {} }, window: { confirm: () => true }, _: text => text, E: (tag, attrs, text) => ({ text }), ui: { addNotification: (_, el) => notifications.push(el.text) } });
  vm.runInContext('(function() {' + source.replace('return view.extend(', 'view.extend(') + '; this.api = { runAction, itemStatus }; }).call(this);', context);
  return { ...context.api, notifications };
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
