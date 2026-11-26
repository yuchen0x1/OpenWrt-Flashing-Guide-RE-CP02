'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const updater = require('../site/project-update');
const project = 'OpenWrt-Flashing-Guide-RE-CP02';
const releases = 'https://github.com/yuchen0x1/' + project + '/releases/tag/v';
function manifest(version) { return { schema: 1, project, version, releaseUrl: releases + version }; }
function response(value) { return { ok: true, text: async () => JSON.stringify(value) }; }

async function run() {
  assert.equal(updater.compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(updater.compareVersions('2.0.0', '1.99.99'), 1);
  assert.equal(updater.compareVersions('1.5.2', '1.5.2'), 0);
  assert.equal(updater.compareVersions('1.5.1', '1.5.2'), -1);
  for (const version of ['v1.5.2', '1.5', '01.5.2', '1.5.2-rc1', '1.5.2\n', '1.5.9007199254740992', null]) {
    assert.throws(() => updater.parseVersion(version), /Invalid project version/);
  }
  for (const patch of [
    { schema: 2 }, { project: 'another-project' },
    { releaseUrl: 'javascript:alert(1)' },
    { releaseUrl: releases + '1.5.2?redirect=https://example.com' },
    { releaseUrl: 'https://github.com.evil.example/' + project + '/releases/tag/v1.5.2' }
  ]) assert.throws(() => updater.validateManifest({ ...manifest('1.5.2'), ...patch }), /Invalid project/);

  const requests = [];
  const newer = await updater.checkUpdate(async (url, options) => {
    requests.push({ url, options });
    return response(manifest(requests.length === 1 ? '1.5.2' : '1.5.3'));
  });
  assert(newer.available);
  assert.equal(newer.latest.releaseUrl, releases + '1.5.3');
  assert.equal(requests[0].url, '../project-version.json');
  assert.equal(requests[1].url, 'https://raw.githubusercontent.com/yuchen0x1/' + project + '/main/project-version.json');
  for (const request of requests) {
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.redirect, 'error');
  }
  for (const remote of ['1.5.2', '1.5.1']) {
    let count = 0;
    const result = await updater.checkUpdate(async () => response(manifest(++count === 1 ? '1.5.2' : remote)));
    assert(!result.available, 'Equal and older versions must not prompt a downgrade.');
  }
  await assert.rejects(updater.fetchManifest(async () => { throw new Error('offline'); }, 'manifest'), /offline/);
  await assert.rejects(updater.fetchManifest(async () => ({ ok: false, status: 404 }), 'manifest'), /HTTP 404/);
  await assert.rejects(updater.fetchManifest(async () => ({ ok: true, text: async () => '{bad' }), 'manifest'), SyntaxError);
  await assert.rejects(updater.fetchManifest(async () => ({ ok: true, text: async () => ' '.repeat(16385) }), 'manifest'), /too large/);
  let signal;
  await assert.rejects(updater.fetchManifest((url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }, 'manifest', 10), /timed out/);
  assert(signal.aborted);

  function element() {
    return { textContent: '', hidden: false, disabled: false, events: {},
      addEventListener(name, listener) { this.events[name] = listener; } };
  }
  const status = element();
  const button = element();
  const link = element();
  const children = { '[data-project-update-status]': status, '[data-project-update-check]': button, '[data-project-update-link]': link };
  const container = { dataset: { projectVersion: '1.5.2' }, querySelector: selector => children[selector], setAttribute() {} };
  const doc = { documentElement: { lang: 'en-US' }, querySelector: () => container };
  let offline = true;
  let calls = 0;
  const mounted = updater.mount(doc, async () => {
    calls++;
    if (offline) throw new Error('offline');
    return response(manifest(calls % 2 ? '1.5.3' : '1.5.2'));
  });
  await mounted.ready;
  assert(status.textContent.includes('failed'));
  assert.equal(button.textContent, 'Retry');
  assert(!button.disabled);
  assert(link.hidden);
  offline = false;
  await button.events.click();
  assert(status.textContent.includes('New version: v1.5.3'));
  assert.equal(link.href, releases + '1.5.3');
  assert(!link.hidden);
  assert(!button.disabled);

  const root = path.resolve(__dirname, '..');
  const current = updater.validateManifest(JSON.parse(fs.readFileSync(path.join(root, 'project-version.json'), 'utf8')));
  const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
  assert(html.includes('data-project-version="' + current.version + '"'));
  assert(html.includes('src="project-update.js"'));
  console.log('PASS project updates: numeric versions, trusted URLs, no downgrade, offline retry, timeout and page wiring');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
