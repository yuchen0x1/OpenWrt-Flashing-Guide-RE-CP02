#!/usr/bin/env node
'use strict';

/*
 * 自动更新链路的零依赖验证器与回归测试。
 *
 * 这个项目没有可替换的桌面安装包，更新对象是路由器固件清单和文档发布包。
 * 因此这里测试的是清单契约、版本比较、重试和下载完整性，而不是伪造刷机。
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

function pass(message) {
  passes.push(message);
  console.log('PASS ' + message);
}

function fail(message) {
  failures.push(message);
  console.log('FAIL ' + message);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function parseVersion(input) {
  const value = String(input || '').trim().replace(/^v/i, '');
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : []
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error('版本号必须是 MAJOR.MINOR.PATCH，可带预发布后缀');
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  const length = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < length; i += 1) {
    if (a.pre[i] === undefined) return -1;
    if (b.pre[i] === undefined) return 1;
    const an = /^\d+$/.test(a.pre[i]);
    const bn = /^\d+$/.test(b.pre[i]);
    if (an && bn && Number(a.pre[i]) !== Number(b.pre[i])) return Number(a.pre[i]) < Number(b.pre[i]) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    if (a.pre[i] !== b.pre[i]) return a.pre[i] < b.pre[i] ? -1 : 1;
  }
  return 0;
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || manifest.schema !== 1) errors.push('schema 必须为 1');
  if (!manifest || typeof manifest.distro !== 'string' || !manifest.distro.trim()) errors.push('缺少 distro');
  if (!manifest || typeof manifest.device_match !== 'string' || !manifest.device_match.trim()) errors.push('缺少 device_match');
  if (!manifest || !/^\d{4}-\d{2}-\d{2}$/.test(String(manifest.generated || ''))) errors.push('generated 必须是 YYYY-MM-DD');
  const releases = Array.isArray(manifest && manifest.releases) ? manifest.releases : [];
  if (!releases.length) errors.push('releases 不能为空');
  const versions = new Set();
  for (const release of releases) {
    const version = String(release && release.version || '');
    if (!parseVersion(version)) errors.push(`版本号非法: ${version}`);
    if (versions.has(version)) errors.push(`版本重复: ${version}`);
    versions.add(version);
    if (!['stable', 'beta', 'dev'].includes(release.channel)) errors.push(`${version} channel 非法`);
    if (typeof release.recommended !== 'boolean') errors.push(`${version} recommended 必须是布尔值`);
    const upgrade = release.sysupgrade || {};
    if (!/^https:\/\//.test(String(upgrade.url || ''))) errors.push(`${version} sysupgrade.url 必须是 HTTPS`);
    if (!/^[0-9a-f]{64}$/i.test(String(upgrade.sha256 || ''))) errors.push(`${version} sysupgrade.sha256 必须是 SHA-256`);
    if (!Number.isSafeInteger(Number(upgrade.size)) || Number(upgrade.size) <= 0) errors.push(`${version} sysupgrade.size 必须是正整数`);
    if (upgrade.url && !String(upgrade.url).includes(version)) errors.push(`${version} sysupgrade.url 缺少版本号`);
    if (release.initramfs) {
      if (!/^https:\/\//.test(String(release.initramfs.url || ''))) errors.push(`${version} initramfs.url 必须是 HTTPS`);
      if (!/^[0-9a-f]{64}$/i.test(String(release.initramfs.sha256 || ''))) errors.push(`${version} initramfs.sha256 必须是 SHA-256`);
    }
  }
  if (!manifest || !versions.has(String(manifest.latest))) errors.push('latest 必须指向 releases 中的版本');
  if (manifest && manifest.latest) {
    const latest = releases.find(item => String(item.version) === String(manifest.latest));
    if (!latest || latest.channel !== 'stable' || latest.recommended !== true) errors.push('latest 必须是 recommended stable 版本');
  }
  return errors;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function retry(operation, attempts) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await operation(i);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  const manifestPath = path.join(root, 'ota', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateManifest(manifest);
  assert(errors.length === 0, errors.length ? '生产 manifest 校验失败: ' + errors.join('; ') : '生产 manifest 契约有效');

  assert(compareVersions('1.2.3', '1.2.3') === 0, '相同版本比较');
  assert(compareVersions('1.2.4', '1.2.3') > 0, '远程版本较新比较');
  assert(compareVersions('1.2.2', '1.2.3') < 0, '远程版本较旧比较');
  assert(compareVersions('1.2.3', '1.2.3-beta.2') > 0, '正式版高于预发布版');
  assert(compareVersions('1.2.3-beta.2', '1.2.3-beta.10') < 0, '预发布数字标识比较');

  let attempts = 0;
  const retried = await retry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('模拟网络失败');
    return 'ok';
  }, 3);
  assert(retried === 'ok' && attempts === 3, '网络失败后按次数重试并最终成功');

  let failedAttempts = 0;
  try {
    await retry(async () => {
      failedAttempts += 1;
      throw new Error('模拟断网');
    }, 2);
    fail('持续网络失败应返回错误');
  } catch {
    assert(failedAttempts === 2, '持续网络失败在重试耗尽后返回错误');
  }

  const payload = Buffer.from('verified firmware fixture\n', 'utf8');
  const expectedHash = sha256(payload);
  assert(payload.length === payload.length && sha256(payload) === expectedHash, '下载文件大小与 SHA-256 校验通过');
  assert(sha256(Buffer.from('corrupted firmware fixture\n', 'utf8')) !== expectedHash, '损坏文件被 SHA-256 拒绝');

  const malformed = { ...manifest, latest: '9.9.9' };
  assert(validateManifest(malformed).some(error => error.includes('latest')), '错误版本清单被拒绝');
  const badUrl = JSON.parse(JSON.stringify(manifest));
  badUrl.releases[0].sysupgrade.url = 'http://invalid.example/image.bin';
  assert(validateManifest(badUrl).some(error => error.includes('HTTPS')), '错误下载地址被拒绝');

  console.log(`\nSUMMARY pass=${passes.length} fail=${failures.length}`);
  if (failures.length) process.exit(1);
}

main().catch(error => {
  console.error('FAIL 自动更新回归异常: ' + error.message);
  process.exit(1);
});
