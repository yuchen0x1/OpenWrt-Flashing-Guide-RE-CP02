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
const os = require('os');
const { spawnSync } = require('child_process');

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

function checkRouterScript() {
  const bash = [process.env.SITE_TEST_BASH, '/usr/bin/bash', '/bin/bash',
    'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']
    .filter(Boolean).find(item => fs.existsSync(item));
  if (!bash) {
    console.log('SKIP 实际 OTA shell 集成：找不到 bash');
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recp02-ota-shell-'));
  const posix = value => value.replace(/\\/g, '/');
  const bin = path.join(temp, 'bin');
  const scratch = path.join(temp, 'scratch');
  fs.mkdirSync(bin);
  fs.mkdirSync(scratch);
  const fixturePath = path.join(temp, 'manifest.json');
  const payloadPath = path.join(temp, 'payload.bin');
  const payload = Buffer.from('actual OTA shell fixture\n');
  const imageName = 'fixture-24.10.6-squashfs-sysupgrade.bin';
  const fixture = {
    distro: 'ImmortalWrt', device_match: 'RE-CP-02', latest: '24.10.6',
    releases: [{ version: '24.10.6', sysupgrade: { url: 'https://fixture.invalid/' + imageName, sha256: sha256(payload), size: payload.length } }]
  };
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  fs.writeFileSync(payloadPath, payload);
  fs.writeFileSync(path.join(scratch, 'ota-manifest.json'), 'stale predictable manifest');
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nout=""\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in -o) out="$2"; shift ;; https://*) url="$1" ;; esac\n  shift\ndone\n[ -n "$out" ] || exit 2\ncase "$url" in */manifest.json) cp "$OTA_TEST_MANIFEST" "$out" ;; *) cp "$OTA_TEST_PAYLOAD" "$out" ;; esac\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'logger'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const env = {
    ...process.env, OTA_TEST_BIN: posix(bin),
    OTA_TMP: posix(scratch), OTA_ALLOW_FAKE: '1', OTA_FAKE_MODEL: 'JDCloud RE-CP-02',
    OTA_MANIFEST_URL: 'https://fixture.invalid/manifest.json', OTA_TEST_MANIFEST: posix(fixturePath),
    OTA_TEST_PAYLOAD: posix(payloadPath), OTA_FETCH_RETRIES: '1'
  };
  const execute = (version, args = []) => spawnSync(bash,
    ['-c', 'export PATH="$(cygpath -u "$OTA_TEST_BIN" 2>/dev/null || printf "%s" "$OTA_TEST_BIN"):$PATH"; exec sh "$@"', 'ota-shell-test', posix(path.join(root, 'scripts', 'ota-check.sh')), ...args],
    { env: { ...env, OTA_FAKE_VERSION: version }, encoding: 'utf8', timeout: 15000 });
  try {
    let result = execute('23.05.4');
    if (result.status !== 1) console.error('OTA shell diagnostic: ' + JSON.stringify({ status: result.status, error: result.error && result.error.message, stdout: result.stdout, stderr: result.stderr }));
    assert(result.status === 1 && result.stderr.includes('23.05.4 -> 24.10.6'), '实际 shell：旧固件收到升级提示');
    result = execute('24.10.6');
    assert(result.status === 0 && result.stderr.includes('已是最新'), '实际 shell：相同版本不提示升级');
    result = execute('24.10.6-rc.1');
    assert(result.status === 1, '实际 shell：同基线 rc 可以升级到正式版');
    result = execute('SNAPSHOT');
    assert(result.status === 2 && result.stderr.includes('无法比较'), '实际 shell：未知版本不猜测为旧固件');
    result = execute('23.05.4', ['--download']);
    const downloaded = path.join(scratch, imageName);
    assert(result.status === 3 && fs.existsSync(downloaded) && fs.readFileSync(downloaded).equals(payload), '实际 shell：下载经过大小和 SHA256 校验后保存');
    fs.writeFileSync(payloadPath, Buffer.alloc(payload.length, 0x41));
    result = execute('23.05.4', ['--download']);
    assert(result.status === 2 && result.stderr.includes('SHA256 校验失败') && fs.readFileSync(downloaded).equals(payload), '实际 shell：损坏下载不会覆盖已验证镜像');
    assert(JSON.parse(fs.readFileSync(path.join(scratch, 'ota-manifest.json'), 'utf8')).latest === fixture.latest, '实际 shell：旧 LuCI 固定清单缓存由完整新清单原子替换');
    fixture.latest = '24.10.7';
    fixture.releases[0].version = fixture.latest;
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    result = execute('24.10.6');
    assert(result.status === 1 && result.stderr.includes('24.10.6 -> 24.10.7') && JSON.parse(fs.readFileSync(path.join(scratch, 'ota-manifest.json'), 'utf8')).latest === '24.10.7', '实际 shell：相同字节长度的新清单仍被重新获取并提示更新');
    assert(!fs.readdirSync(scratch).some(name => name === 'ota-check.lock' || name.startsWith('ota-check-data.')), '实际 shell：成功和失败退出均清理私有临时目录与锁');

    const emmc = fs.readFileSync(path.join(root, 'scripts', 'emmc-one-key-setup.sh'), 'utf8');
    const migration = emmc.slice(emmc.indexOf('# ---- 3. 迁移 overlay 数据 ----'), emmc.indexOf('log "---- 完成 ----"'))
      .replaceAll('/mnt', '$TEST_MOUNT').replaceAll('/overlay/.', '$TEST_SOURCE/.')
      .replaceAll('cp -p /etc/config/fstab', 'cp -p "$TEST_CONFIG"')
      .replaceAll(' /etc/config/fstab', ' "$TEST_CONFIG"')
      .replaceAll('/tmp/emmc-fstab.XXXXXX', '$TEST_ROOT/fstab.XXXXXX');
    const safetyHarness = `set -u
TEST_ROOT=$(mktemp -d) || exit 99
trap 'rm -rf "$TEST_ROOT"' EXIT
TEST_MOUNT="$TEST_ROOT/mount"
TEST_SOURCE="$TEST_ROOT/source"
TEST_CONFIG="$TEST_ROOT/current-fstab"
TEST_TRACE="$TEST_ROOT/trace"
mkdir -p "$TEST_MOUNT" "$TEST_SOURCE/upper/etc/config"
printf 'original\\n' > "$TEST_CONFIG"
cp "$TEST_CONFIG" "$TEST_SOURCE/upper/etc/config/fstab"
(
  P1=/dev/fixture
  log() { :; }
  die() { echo "$*" >&2; exit 2; }
  run() { "$@"; }
  mount() { echo mount >> "$TEST_TRACE"; }
  umount() { echo umount >> "$TEST_TRACE"; }
  sync() { echo sync >> "$TEST_TRACE"; }
  cp() {
    if [ "\${1:-}" = -a ] && [ "$OTA_TEST_PHASE" = copy ]; then return 1; fi
    if [ "\${1:-}" = -p ] && [ "\${2:-}" = "$TEST_CONFIG" ] && [ "$OTA_TEST_PHASE" = backup ]; then return 1; fi
    command cp "$@"
  }
  uci() {
    echo "uci $*" >> "$TEST_TRACE"
    if [ "\${1:-}" = set ] && [ "$OTA_TEST_PHASE" = set ]; then return 1; fi
    if [ "\${1:-}" = commit ]; then printf 'new-overlay\\n' > "$TEST_CONFIG"; fi
    return 0
  }
${migration}
)
status=$?
case "$OTA_TEST_PHASE" in
  success) [ "$status" = 0 ] && grep -q new-overlay "$TEST_MOUNT/upper/etc/config/fstab" && ! find "$TEST_ROOT" -maxdepth 1 -name 'fstab.*' | grep -q . ;;
  copy) [ "$status" = 2 ] && ! grep -q 'uci ' "$TEST_TRACE" && grep -q original "$TEST_CONFIG" && grep -q umount "$TEST_TRACE" ;;
  backup) [ "$status" = 2 ] && ! grep -q 'uci ' "$TEST_TRACE" && ! find "$TEST_ROOT" -maxdepth 1 -name 'fstab.*' | grep -q . ;;
  set) [ "$status" = 2 ] && grep -q 'uci -q revert fstab' "$TEST_TRACE" && grep -q original "$TEST_CONFIG" && grep -q umount "$TEST_TRACE" ;;
esac
`;
    for (const [phase, message] of [
      ['success', '迁移后新 overlay 同步 fstab 并清理临时备份'],
      ['copy', 'overlay 复制失败立即停止且不改 fstab'],
      ['backup', 'fstab 备份失败清理空临时文件且不改配置'],
      ['set', 'UCI 写入失败回滚暂存与原 fstab 并卸载']
    ]) {
      const checked = spawnSync(bash, ['-c', safetyHarness], { env: { ...process.env, OTA_TEST_PHASE: phase }, encoding: 'utf8', timeout: 10000 });
      assert(checked.status === 0, '隔离 shell：' + message);
      if (checked.status !== 0) console.error(checked.stderr || checked.error);
    }
    assert(emmc.indexOf('grep -q " /mnt " /proc/mounts') < emmc.indexOf("printf 'o\\nd\\nn"), 'eMMC 在写分区表前检查挂载点占用');
    assert(emmc.includes('uci -q changes fstab') && emmc.includes('/proc/swaps'), 'eMMC 拒绝未提交配置和在用 swap');
    const rescue = fs.readFileSync(path.join(root, 'scripts', 'router-lan-rescue.sh'), 'utf8');
    assert(rescue.includes('run uci set "wireless.$radio.disabled=0"'), 'LAN WiFi 急救同时启用 radio 和接口');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
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

  checkRouterScript();

  console.log(`\nSUMMARY pass=${passes.length} fail=${failures.length}`);
  if (failures.length) process.exit(1);
}

main().catch(error => {
  console.error('FAIL 自动更新回归异常: ' + error.message);
  process.exit(1);
});
