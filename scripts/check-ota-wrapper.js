#!/usr/bin/env node
'use strict';

/*
 * ota-check-ui 的零依赖回归检查。
 *
 * 重点验证网页包装器的并发门禁不是“先检查再写文件”的竞态实现：锁目录
 * 必须通过 mkdir 原子创建，后台任务必须写完成标记并清理锁。Linux CI 上
 * 还会用一个假的 ota-check 做一次双启动回归；没有可用 /proc 时只做静态检查。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const wrapperPath = path.join(root, 'luci-app-ota-check', 'root', 'usr', 'bin', 'ota-check-ui');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + detail));
}

check('wrapper allows isolated output path in tests', /OTA_UI_OUT:-/.test(wrapper));
check('wrapper allows isolated lock path in tests', /OTA_UI_LOCK:-/.test(wrapper));
check('wrapper allows an injected ota-check command', /OTA_CHECK_BIN=/.test(wrapper));
check('lock state is stored below a directory', /\[ -f "\$LOCK\/pid" \]/.test(wrapper));
check('stale lock detection verifies process liveness', /kill -0 "\$_pid"/.test(wrapper));
check('lock acquisition uses atomic mkdir', /mkdir "\$LOCK"/.test(wrapper));
check('busy requests return OTA_BUSY', /echo "OTA_BUSY"/.test(wrapper));
check('background task writes its exit marker', /__OTA_DONE_\$_rc__/.test(wrapper));
check('background task removes the lock directory', /rm -rf "\$LOCK"/.test(wrapper));
check('background stdout and stderr are redirected', /> "\$OUT" 2>&1/.test(wrapper));

function posixPath(value) {
  return value.replace(/\\/g, '/');
}

function findBash() {
  const candidates = [
    process.env.SITE_TEST_BASH,
    '/usr/bin/bash',
    '/bin/bash',
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe'
  ].filter(Boolean);
  return candidates.find(candidate => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) || null;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function dynamicCheck() {
  if (!fs.existsSync('/proc')) {
    console.log('SKIP 动态并发回归：当前环境没有 /proc，保留静态检查');
    return;
  }
  const bash = findBash();
  if (!bash) {
    console.log('SKIP 动态并发回归：找不到 bash');
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recp02-ota-wrapper-'));
  const out = path.join(temp, 'out');
  const lock = path.join(temp, 'lock');
  const fake = path.join(temp, 'ota-check-fake.sh');
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 2\nprintf "fake ota-check\\n"\n', { mode: 0o755 });
  const env = {
    ...process.env,
    OTA_UI_OUT: posixPath(out),
    OTA_UI_LOCK: posixPath(lock),
    OTA_CHECK_BIN: posixPath(fake)
  };
  try {
    const first = spawn(bash, [posixPath(wrapperPath), '--test'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let firstOut = '';
    first.stdout.on('data', chunk => { firstOut += chunk; });
    await new Promise(resolve => setTimeout(resolve, 150));
    const second = await run(bash, [posixPath(wrapperPath), '--test'], env);
    const firstCode = await new Promise(resolve => first.on('close', resolve));
    const output = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    check('concurrent second request is rejected', second.stdout.includes('OTA_BUSY'), second.stdout || second.stderr);
    check('first request completes with a marker', firstCode === 0 && /__OTA_DONE_0__/.test(output), output);
    check('first request output remains intact', output.includes('fake ota-check'), output);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

dynamicCheck().then(() => {
  const failed = results.filter(item => !item.ok).length;
  console.log('\nSUMMARY pass=' + (results.length - failed) + ' fail=' + failed);
  process.exit(failed ? 1 : 0);
}).catch(error => {
  console.error('FATAL ' + (error && error.message ? error.message : error));
  process.exit(1);
});
