#!/usr/bin/env node
'use strict';

/* 生成 GitHub Release 中的可审计 OTA 快照，不伪造固件下载地址或签名。 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function value(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const version = value('--version', process.env.GITHUB_REF_NAME || 'v0.0.0');
const output = value('--output', path.join('release', `ota-manifest-${version}.json`));
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ota', 'manifest.json'), 'utf8'));
const projectVersion = String(version).replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(projectVersion)) {
  throw new Error(`Release 标签必须是 vMAJOR.MINOR.PATCH，收到: ${version}`);
}

const sourceEpoch = Number(process.env.SOURCE_DATE_EPOCH);
const generatedAt = Number.isFinite(sourceEpoch) && sourceEpoch > 0
  ? new Date(sourceEpoch * 1000).toISOString()
  : new Date().toISOString();
const metadata = {
  schema: 1,
  project: 'OpenWrt-Flashing-Guide-RE-CP02',
  projectVersion,
  tag: version,
  commit: process.env.GITHUB_SHA || null,
  generatedAt,
  updateModel: 'router-ota-manifest',
  integrity: 'sha256',
  signature: { status: 'not-configured', reason: '当前发布没有代码签名密钥；路由器端使用 HTTPS 与 SHA-256，并在刷写前人工确认。' },
  otaManifest: manifest
};

const absolute = path.resolve(root, output);
fs.mkdirSync(path.dirname(absolute), { recursive: true });
fs.writeFileSync(absolute, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
console.log(absolute);
