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
check('background task writes its exit marker', /__OTA_DONE_%s__/.test(wrapper) && /"\$_rc"/.test(wrapper));
check('background task removes the lock directory', /rm -rf "\$LOCK"/.test(wrapper));
check('background stdout and stderr use the inherited output descriptor', />&3 2>&1/.test(wrapper));
check('output is opened with noclobber', /set -C/.test(wrapper) && /3> "\$OUT"/.test(wrapper));

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
  const bash = findBash();
  if (!bash) {
    console.log('SKIP 动态并发回归：找不到 bash');
    return;
  }
  const probe = await run(bash, ['-c', 'test -d /proc'], process.env);
  if (probe.code !== 0) {
    console.log('SKIP 动态并发回归：shell 环境没有 /proc');
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recp02-ota-wrapper-'));
  const out = path.join(temp, 'out');
  const lock = path.join(temp, 'lock');
  const fake = path.join(temp, 'ota-check-fake.sh');
  fs.writeFileSync(fake, '#!/bin/sh\nprintf "started\\n" >> "$OTA_TEST_TRACE"\nsleep "${OTA_TEST_DELAY:-1}"\nprintf "fake ota-check: %s\\n" "$*"\nexit "${OTA_TEST_RC:-0}"\n', { mode: 0o755 });
  const env = {
    ...process.env,
    OTA_UI_OUT: posixPath(out),
    OTA_UI_LOCK: posixPath(lock),
    OTA_CHECK_BIN: posixPath(fake),
    OTA_TEST_TRACE: posixPath(path.join(temp, 'trace'))
  };
  const waitUntil = async predicate => {
    const deadline = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error('等待后台任务完成超时');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  const outputText = () => fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  try {
    const first = await run(bash, [posixPath(wrapperPath), '--source', 'github', '--version', '24.10.6'], env);
    const second = await run(bash, [posixPath(wrapperPath), '--download'], env);
    check('concurrent second request is rejected', second.stdout.includes('OTA_BUSY'), second.stdout || second.stderr);
    await waitUntil(() => /__OTA_DONE_0__/.test(outputText()) && !fs.existsSync(lock));
    const output = outputText();
    check('first request completes with a marker', first.code === 0 && /__OTA_DONE_0__/.test(output), output);
    check('first request output remains intact', output.includes('fake ota-check'), output);
    check('allowed source and version reach the checker', output.includes('--source github --version 24.10.6'), output);
    for (const code of [1, 2, 3]) {
      const result = await run(bash, [posixPath(wrapperPath), '--download'], { ...env, OTA_TEST_RC: String(code), OTA_TEST_DELAY: '0' });
      await waitUntil(() => outputText().includes(`__OTA_DONE_${code}__`) && !fs.existsSync(lock));
      check(`checker exit ${code} is preserved in completion marker`, result.code === 0 && outputText().includes(`__OTA_DONE_${code}__`), outputText());
    }
    const before = outputText();
    const invalid = [
      ['--flash'], ['--sysupgrade-args=-F'], ['--source', 'other'], ['--source'],
      ['--version', '24.10.6;reboot'], ['--version'], ['--download', '--download'],
      ['--source', 'github', '--source', 'gitee']
    ];
    for (const args of invalid) {
      const result = await run(bash, [posixPath(wrapperPath), ...args], env);
      check('unsafe or malformed RPC arguments rejected: ' + args.join(' '), result.code === 2 && outputText() === before && !fs.existsSync(lock), result.stdout + result.stderr);
    }
    fs.writeFileSync(path.join(temp, 'trace'), '');
    const simultaneous = await Promise.all(Array.from({ length: 8 }, () => run(bash, [posixPath(wrapperPath)], env)));
    await waitUntil(() => /__OTA_DONE_0__/.test(outputText()) && !fs.existsSync(lock));
    const starts = fs.readFileSync(path.join(temp, 'trace'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
    check('eight simultaneous requests start exactly one checker', starts.length === 1 && simultaneous.filter(item => item.stdout.includes('OTA_BUSY')).length === 7, JSON.stringify({ starts, simultaneous }));
    fs.writeFileSync(path.join(temp, 'trace'), '');
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'pid'), '99999999\n');
    const staleRace = await Promise.all(Array.from({ length: 8 }, () => run(bash, [posixPath(wrapperPath)], env)));
    await waitUntil(() => /__OTA_DONE_0__/.test(outputText()) && !fs.existsSync(lock));
    const recoveredStarts = fs.readFileSync(path.join(temp, 'trace'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
    check('simultaneous stale-lock recovery starts exactly one checker', recoveredStarts.length === 1 && staleRace.filter(item => item.stdout.includes('OTA_BUSY')).length === 7, JSON.stringify({ recoveredStarts, staleRace }));
    fs.mkdirSync(lock);
    const emptyLock = await run(bash, [posixPath(wrapperPath)], env);
    check('a newly created lock without a published PID is kept busy', emptyLock.stdout.includes('OTA_BUSY') && fs.existsSync(lock));
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
