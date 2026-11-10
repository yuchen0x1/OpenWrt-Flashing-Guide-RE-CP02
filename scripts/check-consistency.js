#!/usr/bin/env node
'use strict';
/*
 * 版本与哈希一致性检查（零依赖，Node 12+）。
 *
 * 官方固件基线在仓库里出现在 6 个位置，只改其中几处就会重演 25.12.5 过期那次
 * 问题。本脚本把「同一事实的多个副本」全部提出来逐项比对，不读写网络：
 *
 *   1. firmware/SHA256SUMS.txt 里官方 sysupgrade / initramfs 的版本、哈希
 *   2. docs/09-official-upgrade.md 的哈希表与下载命令
 *   3. firmware/README.md 的基线表
 *   4. README.md 的官方更新段落与固件清单
 *   5. site/index.html 的固件卡片、复制按钮和下载链接
 *   6. ota/manifest.json 自身结构（latest 必须存在、URL 必须 https）
 *
 * 用法：
 *   node scripts/check-consistency.js            只检查，失败退出码 1
 *   node scripts/check-consistency.js --verbose  同时打印每一项比对结果
 *
 * 设计边界：不联网、不校验真实镜像、不判断"上游是否又出新版本"——那是人工
 * 核对 sha256sums 的事。这里只保证仓库内部自洽。
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const verbose = process.argv.includes('--verbose');
const failures = [];
const passes = [];

const OFFICIAL = 'openwrt';
const DEVICE = 'jdcloud_re-cp-02';
const TARGET = 'ramips-mt7621';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function pass(message) {
  passes.push(message);
  if (verbose) console.log('PASS ' + message);
}

function fail(message) {
  failures.push(message);
  console.log('FAIL ' + message);
}

function uniq(list) {
  return [...new Set(list)];
}

/* ---------- 1. SHA256SUMS：官方基线的唯一权威副本 ---------- */

const sumsText = read('firmware/SHA256SUMS.txt');
const officialEntries = [];
for (const line of sumsText.split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/);
  if (!m) {
    fail('SHA256SUMS 行格式非法: ' + line);
    continue;
  }
  const name = m[2];
  const ver = name.match(/^openwrt-(\d+\.\d+\.\d+)-ramips-mt7621-jdcloud_re-cp-02-(squashfs-sysupgrade|initramfs-kernel)\.bin$/);
  if (ver) officialEntries.push({ hash: m[1].toLowerCase(), name, version: ver[1], kind: ver[2] });
}

if (officialEntries.length !== 2) {
  fail('SHA256SUMS 应恰好包含 1 个官方 sysupgrade + 1 个官方 initramfs，实际 ' + officialEntries.length);
}

const sysupgrade = officialEntries.find(e => e.kind === 'squashfs-sysupgrade');
const initramfs = officialEntries.find(e => e.kind === 'initramfs-kernel');

if (!sysupgrade || !initramfs) {
  console.log('\n无法继续比对：SHA256SUMS 缺少官方镜像条目。');
  process.exit(1);
}
if (sysupgrade.version !== initramfs.version) {
  fail('官方 sysupgrade 与 initramfs 版本不一致: ' + sysupgrade.version + ' vs ' + initramfs.version);
} else {
  pass('SHA256SUMS 两个官方镜像版本一致: ' + sysupgrade.version);
}

const baseline = sysupgrade.version;
const shaUp = sysupgrade.hash;
const shaInit = initramfs.hash;
const nameUp = sysupgrade.name;
const nameInit = initramfs.name;

/* ---------- 2-5. 各文档/站点里出现的版本号必须与基线一致 ---------- */

/**
 * 收集文本里所有 25.12.x 形态的官方版本号。
 * 只检查"看起来在描述当前官方基线"的位置，历史小节（CHANGELOG、个人构建）不在此列。
 */
function collectOfficialVersions(text) {
  const found = [];
  const re = /\bopenwrt-(\d+\.\d+\.\d+)-ramips-mt7621-jdcloud_re-cp-02-/g;
  let m;
  while ((m = re.exec(text)) !== null) found.push(m[1]);
  return uniq(found);
}

const filesToCheck = [
  'README.md',
  'docs/02-flashing.md',
  'docs/09-official-upgrade.md',
  'firmware/README.md',
  'ota/README.md',
  'site/index.html'
];

for (const rel of filesToCheck) {
  const text = read(rel);
  const versions = collectOfficialVersions(text);
  for (const v of versions) {
    if (v !== baseline) {
      fail(rel + ' 出现与 SHA256SUMS 不一致的官方镜像版本 ' + v + '（基线 ' + baseline + '）');
    }
  }
  if (versions.length) {
    pass(rel + ' 官方镜像文件名版本 = ' + baseline);
  }
}

/* ---------- 3. 文档中的哈希必须与 SHA256SUMS 一致 ---------- */

function assertHash(rel, text, hash, label) {
  if (text.includes(hash)) {
    pass(rel + ' 含 ' + label + ' 哈希');
  } else {
    fail(rel + ' 缺少 ' + label + ' 哈希 ' + hash.slice(0, 12) + '…');
  }
}

assertHash('docs/09-official-upgrade.md', read('docs/09-official-upgrade.md'), shaUp, 'sysupgrade');
assertHash('docs/09-official-upgrade.md', read('docs/09-official-upgrade.md'), shaInit, 'initramfs');
assertHash('firmware/README.md', read('firmware/README.md'), shaUp, 'sysupgrade');
assertHash('firmware/README.md', read('firmware/README.md'), shaInit, 'initramfs');
assertHash('site/index.html', read('site/index.html'), shaUp, 'sysupgrade');

/* ---------- 4. 站点下载链接必须指向基线版本 ---------- */

const siteHtml = read('site/index.html');
const downloadLinks = uniq([...siteHtml.matchAll(/https:\/\/downloads\.openwrt\.org\/releases\/([^/]+)\/targets\/ramips\/mt7621\//g)].map(m => m[1]));
if (!downloadLinks.length) {
  fail('site/index.html 没有官方下载链接');
} else {
  for (const v of downloadLinks) {
    if (v !== baseline) fail('site/index.html 下载链接指向 ' + v + '，基线是 ' + baseline);
  }
  if (downloadLinks.every(v => v === baseline)) pass('site/index.html 下载链接 = ' + baseline);
}

/* ---------- 5. 校验日期字符串三处一致 ---------- */

const dateSources = {
  'docs/09-official-upgrade.md': uniq([...read('docs/09-official-upgrade.md').matchAll(/20\d\d-\d\d-\d\d/g)].map(m => m[0])),
  'firmware/README.md': uniq([...read('firmware/README.md').matchAll(/20\d\d-\d\d-\d\d/g)].map(m => m[0])),
  'site/index.html': uniq([...siteHtml.matchAll(/20\d\d\.\d\d\.\d\d/g)].map(m => m[0].replace(/\./g, '-')))
};

for (const [rel, dates] of Object.entries(dateSources)) {
  if (!dates.length) fail(rel + ' 找不到校验日期');
}

const allDates = uniq(Object.values(dateSources).flat());
if (allDates.length > 1) {
  fail('校验日期不一致（' + allDates.join(' / ') + '）；todo：核对后统一');
} else if (allDates.length === 1) {
  pass('校验日期统一为 ' + allDates[0]);
}

/* ---------- 6. ota/manifest.json 内部自洽 ---------- */

let manifest;
try {
  manifest = JSON.parse(read('ota/manifest.json'));
} catch (e) {
  fail('ota/manifest.json 不是合法 JSON: ' + e.message);
}

if (manifest) {
  const versions = (manifest.releases || []).map(r => String(r.version));
  if (!versions.includes(String(manifest.latest))) {
    fail('ota/manifest.json latest=' + manifest.latest + ' 不在 releases 中');
  } else {
    pass('ota/manifest.json latest 存在于 releases');
  }
  for (const r of manifest.releases || []) {
    const su = r.sysupgrade || {};
    if (!/^https:\/\//.test(su.url || '')) fail('OTA ' + r.version + ' sysupgrade.url 不是 https');
    if (!/^[0-9a-f]{64}$/i.test(su.sha256 || '')) fail('OTA ' + r.version + ' sysupgrade.sha256 格式非法');
    if (!(Number(su.size) > 0)) fail('OTA ' + r.version + ' sysupgrade.size 非法');
    if (su.url && !su.url.includes(String(r.version))) {
      fail('OTA ' + r.version + ' sysupgrade.url 缺少版本号，疑似复制粘贴残留');
    }
  }
  if (!failures.some(f => f.startsWith('OTA '))) pass('ota/manifest.json 各版本 URL/SHA256/size 自洽');
}

/* ---------- 汇总 ---------- */

console.log('\nSUMMARY pass=' + passes.length + ' fail=' + failures.length + ' (baseline ' + OFFICIAL + ' ' + baseline + ')');
if (failures.length) process.exit(1);
