#!/usr/bin/env node
'use strict';
/*
 * 阅读站点交互回归（零依赖，Node 22+ 自带 WebSocket）。
 *
 * 覆盖三处曾经真实出错的交互：
 *   1. 打开文档弹窗后焦点是否落在可聚焦元素上（旧代码聚焦到无 tabindex 的遮罩，等于没聚焦）
 *   2. 点「下一篇」后焦点是否还留在弹窗内（旧代码原按钮被 innerHTML 替换，焦点掉回 body）
 *   3. 搜索框清空后，在途请求是否还会把旧结果写回来（旧代码先 return 后递增代次）
 *   4. 文档/搜索模态的 Tab 是否保持在当前对话框内
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

  const outputDir = path.resolve(__dirname, '../outputs/site-check');
  fs.mkdirSync(outputDir, { recursive: true });
  const userDataDir = path.join(outputDir, 'browser-' + process.pid);
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
    const pageErrors = [];

    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails.text);
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

    r = await evaluate(`
      (() => {
        const last = document.querySelector('.doc-next');
        const close = document.querySelector('button[data-close-modal]');
        if (!last || !close) return { error: 'missing dialog focus targets' };
        last.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        return {
          activeIsFirst: document.activeElement === close,
          active: document.activeElement && document.activeElement.outerHTML
        };
      })()
    `);
    check('文档弹窗 Tab 到末尾后回到首个控件', !!(r.value && r.value.activeIsFirst), JSON.stringify(r.value));

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
        input.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        const focusTrapped = document.activeElement === input;
        input.value = 'openwrt';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 3000));
        const results = document.getElementById('search-results');
        return {
          resultCount: results.querySelectorAll('.search-result').length,
          stillOpen: document.getElementById('search-modal').classList.contains('is-open'),
          focusTrapped
        };
      })()
    `);
    check('清空搜索后旧结果不回写', !!(r.value && r.value.resultCount === 0), JSON.stringify(r.value));
    check('搜索弹窗 Tab 保持焦点在输入框', !!(r.value && r.value.focusTrapped), JSON.stringify(r.value));

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

    /* Failed search documents can be retried, and results navigate to their section. */
    // Reload with an injected one-shot network failure before app initialization.
    const injected = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const originalFetch = window.fetch;
      let failOnce = true;
      window.fetch = (url, options) => {
        if (String(url).includes('AUTO_UPDATE') && failOnce) { failOnce = false; return Promise.resolve({ok:false,status:503}); }
        return originalFetch(url, options);
      };
    ` });
    await send('Page.navigate', { url: URL_BASE });
    await sleep(1000);
    r = await evaluate(`(async () => {
      document.getElementById('search-open').click();
      const input = document.getElementById('search-input');
      input.value = 'manifest'; input.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 700));
      const retry = document.getElementById('search-retry');
      const sawFailure = !!retry;
      if (retry) retry.click();
      await new Promise(r => setTimeout(r, 700));
      const recovered = !document.getElementById('search-retry');
      const result = document.querySelector('.search-result[data-section="sec-1"]') || document.querySelector('.search-result[data-section^="sec-"]');
      if (result) result.click();
      await new Promise(r => setTimeout(r, 300));
      return { sawFailure, recovered, landed: !!document.querySelector('.search-target'), focused: document.activeElement.classList.contains('search-target') };
    })()`);
    check('搜索失败明确提示且可重试恢复', !!(r.value && r.value.sawFailure && r.value.recovered), JSON.stringify(r.value));
    check('搜索结果跳到命中章节并聚焦', !!(r.value && r.value.landed && r.value.focused), JSON.stringify(r.value));
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.result.identifier });

    /* Closing while a search is in flight must not repaint stale results. */
    const delayed = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const originalFetch = window.fetch;
      window.fetch = (url, options) => String(url).includes('/docs/')
        ? new Promise(resolve => setTimeout(resolve, 250)).then(() => originalFetch(url, options)) : originalFetch(url, options);
    ` });
    await send('Page.navigate', { url: URL_BASE });
    await sleep(1000);
    r = await evaluate(`(async () => {
      document.getElementById('search-open').click();
      const input = document.getElementById('search-input');
      input.value = 'openwrt'; input.dispatchEvent(new Event('input'));
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
      await new Promise(r => setTimeout(r, 700));
      document.getElementById('search-open').click();
      return { count: document.querySelectorAll('.search-result').length, empty: input.value === '' };
    })()`);
    check('关闭后重新打开搜索不显示在途旧结果', !!(r.value && r.value.empty && r.value.count === 0), JSON.stringify(r.value));
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: delayed.result.identifier });
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))`);

    /* Use a deliberately non-firmware file against the real repository manifest. */
    r = await evaluate(`(async () => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['abc'], 'test.bin'));
      const input = document.getElementById('firmware-file'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
      const select = document.getElementById('firmware-expected'); select.value = '0'; select.dispatchEvent(new Event('change'));
      document.getElementById('firmware-check').requestSubmit();
      await new Promise(r => setTimeout(r, 300));
      const result = document.getElementById('firmware-result');
      const mismatch = result.dataset.state === 'mismatch' && result.textContent.includes('ba7816bf');
      select.value = '1'; select.dispatchEvent(new Event('change'));
      return { mismatch, invalidated: result.dataset.state === '', enabled: !document.getElementById('firmware-verify').disabled };
    })()`);
    check('实际文件输入计算 SHA256 并拒绝不匹配文件', !!(r.value && r.value.mismatch), JSON.stringify(r.value));
    check('更换校验目标清除旧结论并恢复操作', !!(r.value && r.value.invalidated && r.value.enabled), JSON.stringify(r.value));
    await send('Page.navigate', { url: URL_BASE });
    await sleep(1000);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['tablet', 820, 1180], ['dark', 1440, 1000]]) {
      if (name === 'dark') await evaluate(`applyThemeMode('dark')`);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
      await evaluate(`document.querySelector('.integrity-panel').scrollIntoView({behavior:'instant',block:'center'})`);
      await sleep(900);
      r = await evaluate(`({ fits: document.documentElement.scrollWidth <= window.innerWidth, form: document.getElementById('firmware-check').getBoundingClientRect().width > 0 })`);
      check(name + ' 视口没有横向溢出且校验表单可见', !!(r.value && r.value.fits && r.value.form), JSON.stringify(r.value));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot.result && shot.result.data) fs.writeFileSync(path.join(outputDir, name + '.png'), Buffer.from(shot.result.data, 'base64'));
    }
    check('浏览器没有未处理脚本异常', pageErrors.length === 0, pageErrors.join('; '));
    ws.close();
  } finally {
    clearTimeout(timer);
    try { child.kill(); } catch {}
    if (path.dirname(userDataDir) === outputDir && path.basename(userDataDir) === 'browser-' + process.pid) {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  }

  const failed = results.filter(item => !item.ok).length;
  console.log('\nSUMMARY pass=' + (results.length - failed) + ' fail=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL ' + (err && err.message ? err.message : err));
  process.exit(2);
});
