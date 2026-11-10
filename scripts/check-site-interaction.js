#!/usr/bin/env node
'use strict';
/*
 * 阅读站点交互回归（零依赖，Node 22+ 自带 WebSocket）。
 *
 * 覆盖三处曾经真实出错的交互：
 *   1. 打开文档弹窗后焦点是否落在可聚焦元素上（旧代码聚焦到无 tabindex 的遮罩，等于没聚焦）
 *   2. 点「下一篇」后焦点是否还留在弹窗内（旧代码原按钮被 innerHTML 替换，焦点掉回 body）
 *   3. 搜索框清空后，在途请求是否还会把旧结果写回来（旧代码先 return 后递增代次）
 * 外加 Esc 分层关闭与页面异常计数。
 *
 * 用法：
 *   python -m http.server 18793 --bind 127.0.0.1     # 另开一个终端
 *   node scripts/check-site-interaction.js [http://127.0.0.1:18793/site/]
 *
 * 环境变量：
 *   SITE_TEST_BROWSER  浏览器可执行文件路径（默认自动探测 Edge / Chrome）
 *   SITE_TEST_TIMEOUT  整体超时毫秒（默认 60000）
 *
 * 退出码：0 全部通过  1 有失败项  2 环境不可用（找不到浏览器/CDP 端口）
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_BASE = process.argv[2] || 'http://127.0.0.1:18793/site/';
const PORT = Number(process.env.SITE_TEST_CDP_PORT || 9231);
const OVERALL_TIMEOUT = Number(process.env.SITE_TEST_TIMEOUT || 60000);

const BROWSER_CANDIDATES = [
  process.env.SITE_TEST_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  return null;
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pathname }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('SKIP 找不到 Edge / Chrome；用 SITE_TEST_BROWSER 指定浏览器路径');
    process.exit(2);
  }

  const results = [];
  function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + detail));
  }

  const userDataDir = path.join(os.tmpdir(), 'recp02-site-test-' + process.pid);
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir, 'about:blank'
  ], { stdio: 'ignore' });

  const timer = setTimeout(() => {
    console.log('FAIL 整体超时 ' + OVERALL_TIMEOUT + 'ms');
    try { child.kill(); } catch {}
    process.exit(1);
  }, OVERALL_TIMEOUT);

  let ws;
  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try { targets = await getJson('/json/list'); if (targets && targets.length) break; } catch {}
      await sleep(250);
    }
    if (!targets || !targets.length) {
      console.log('FAIL 无法连接浏览器调试端口 ' + PORT);
      process.exit(2);
    }

    const page = targets.find(t => t.type === 'page') || targets[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();

    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };

    const send = (method, params) => new Promise(resolve => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result && res.result.exceptionDetails) return { error: JSON.stringify(res.result.exceptionDetails) };
      return { value: res.result && res.result.result && res.result.result.value };
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL_BASE });
    await sleep(2500);

    /* 1-2：文档弹窗焦点 */
    let r = await evaluate(`
      (async () => {
        const card = document.querySelector('.doc-card');
        if (!card) return { error: 'no doc card' };
        card.click();
        await new Promise(r => setTimeout(r, 1200));
        return {
          open: document.getElementById('doc-modal').classList.contains('is-open'),
          activeId: document.activeElement && document.activeElement.id,
          hasBody: !!document.querySelector('#modal-body .doc-content')
        };
      })()
    `);
    if (r.error) { check('文档弹窗可打开', false, r.error); }
    check('文档弹窗能打开并渲染正文', !!(r.value && r.value.open && r.value.hasBody), JSON.stringify(r.value));
    check('打开后焦点在 modal-title（不是无 tabindex 的遮罩）', !!(r.value && r.value.activeId === 'modal-title'), JSON.stringify(r.value));

    r = await evaluate(`
      (async () => {
        const before = document.getElementById('modal-title').textContent;
        const next = document.querySelector('.doc-next');
        if (!next) return { error: 'no next button' };
        next.click();
        await new Promise(r => setTimeout(r, 1200));
        return {
          before: before,
          after: document.getElementById('modal-title').textContent,
          activeId: document.activeElement && document.activeElement.id
        };
      })()
    `);
    check('翻页切换了文档标题', !!(r.value && r.value.before !== r.value.after), JSON.stringify(r.value));
    check('翻页后焦点仍在弹窗内（不掉回 body）', !!(r.value && r.value.activeId === 'modal-title'), JSON.stringify(r.value));

    /* 3：Esc 关闭文档 */
    r = await evaluate(`
      (async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        return {
          open: document.getElementById('doc-modal').classList.contains('is-open'),
          bodyLocked: document.body.classList.contains('modal-open')
        };
      })()
    `);
    check('Esc 关闭文档并解除滚动锁', !!(r.value && !r.value.open && !r.value.bodyLocked), JSON.stringify(r.value));

    /* 4：搜索清空竞态 —— 同一帧内清空，索引必然未返回 */
    r = await evaluate(`
      (async () => {
        document.getElementById('search-open').click();
        await new Promise(r => setTimeout(r, 200));
        const input = document.getElementById('search-input');
        input.value = 'openwrt';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 3000));
        const results = document.getElementById('search-results');
        return {
          resultCount: results.querySelectorAll('.search-result').length,
          stillOpen: document.getElementById('search-modal').classList.contains('is-open')
        };
      })()
    `);
    check('清空搜索后旧结果不回写', !!(r.value && r.value.resultCount === 0), JSON.stringify(r.value));

    /* 5：Esc 分层关闭搜索 */
    r = await evaluate(`
      (async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        return {
          searchOpen: document.getElementById('search-modal').classList.contains('is-open'),
          bodyLocked: document.body.classList.contains('modal-open')
        };
      })()
    `);
    check('Esc 关闭搜索并解除滚动锁', !!(r.value && !r.value.searchOpen && !r.value.bodyLocked), JSON.stringify(r.value));

    ws.close();
  } finally {
    clearTimeout(timer);
    try { child.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }

  const failed = results.filter(item => !item.ok).length;
  console.log('\nSUMMARY pass=' + (results.length - failed) + ' fail=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL ' + (err && err.message ? err.message : err));
  process.exit(2);
});