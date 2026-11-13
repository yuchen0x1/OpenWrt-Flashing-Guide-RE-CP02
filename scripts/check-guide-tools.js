'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const tools = require('../site/guide-tools');
const root = path.resolve(__dirname, '..');
const sha = createHash('sha256').update('abc').digest('hex');
const file = new File(['abc'], 'firmware.bin');

test('实际清单含 8 项；支持 CRLF、中文名与 binary 标记', () => {
  const entries = tools.parseChecksums(fs.readFileSync(path.join(root, 'firmware/SHA256SUMS.txt'), 'utf8'));
  assert.equal(entries.length, 8);
  assert.deepEqual(tools.parseChecksums('\uFEFF# comment\r\n' + sha.toUpperCase() + ' *固件.bin\r\n'), [{ name: '固件.bin', sha256: sha }]);
});
test('清单拒绝空值、错误摘要、重复项与目录路径', () => {
  for (const value of ['', 'bad  a.bin', sha + '  ../a.bin', sha + '  a.bin\n' + sha + '  a.bin']) assert.throws(() => tools.parseChecksums(value));
});
test('WebCrypto 计算与独立 Node 摘要一致；分类匹配、改名和损坏', async () => {
  assert.equal(await tools.hashFile(file, webcrypto.subtle), sha);
  assert.equal(tools.compareFile(file, sha, { name: 'firmware.bin', sha256: sha }), 'match');
  assert.equal(tools.compareFile(file, sha, { name: 'other.bin', sha256: sha }), 'renamed');
  assert.equal(tools.compareFile(file, '0'.repeat(64), { name: 'firmware.bin', sha256: sha }), 'mismatch');
});
test('读取前拒绝空文件、超限文件和缺失 WebCrypto', async () => {
  await assert.rejects(tools.hashFile(new File([], 'empty'), webcrypto.subtle), /非空/);
  await assert.rejects(tools.hashFile({ size: tools.MAX_FILE_SIZE + 1, arrayBuffer() { throw new Error('不应读取'); } }, webcrypto.subtle), /64 MiB/);
  await assert.rejects(tools.hashFile(file, null), /localhost/);
});
test('并发读取合并；成功响应复用；失败响应可重试', async () => {
  let calls = 0;
  const load = tools.createTextLoader(async () => {
    if (++calls === 1) return { ok: false, status: 503 };
    return { ok: true, text: async () => 'body' };
  });
  const first = load('doc');
  assert.equal(load('doc'), first);
  await assert.rejects(first, /503/);
  assert.equal(await load('doc'), 'body');
  assert.equal(await load('doc'), 'body');
  assert.equal(calls, 2);
});
test('读取超时会取消请求并释放失败缓存', async () => {
  let calls = 0;
  const load = tools.createTextLoader((url, { signal }) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
  }), 10);
  await assert.rejects(load('doc'), /超时/);
  await assert.rejects(load('doc'), /超时/);
  assert.equal(calls, 2);
});
test('搜索锚点与渲染器一致，代码中的标题不计入目录', () => {
  const doc = ['00', '准备', '', '../docs/00-preparation.md'];
  const body = '# 准备\n## 网络\nneedle\n```sh\n## fake\n```\n## 校验\nneedle';
  const index = tools.indexDocument(doc, body);
  const hits = tools.searchDocuments([index], 'needle')[0].hits;
  assert.deepEqual(hits.map(h => h.section), ['sec-0', 'sec-1']);
  const rendered = require('../site/markdown').renderMarkdown(body);
  for (const hit of hits) assert.ok(rendered.html.includes('id="' + hit.section + '"'));
});
test('标题命中优先，严格总数上限，空查询无结果', () => {
  const index = Array.from({ length: 10 }, (_, i) => tools.indexDocument([String(i), i === 9 ? 'needle' : 'chapter', '', 'p' + i], 'needle\n'.repeat(10)));
  const result = tools.searchDocuments(index, 'needle', 29);
  assert.equal(result[0].doc[0], '9');
  assert.equal(result.reduce((n, g) => n + g.hits.length, 0), 29);
  assert.deepEqual(tools.searchDocuments(index, ' '), []);
});
test('所有 docs 文档（含 AUTO_UPDATE.md）恰好映射一次且站点脚本存在', () => {
  const app = fs.readFileSync(path.join(root, 'site/app.js'), 'utf8');
  const paths = [...app.matchAll(/'\.\.\/docs\/([^']+)'\s*\]/g)].map(m => m[1]);
  assert.deepEqual(paths.sort(), fs.readdirSync(path.join(root, 'docs')).filter(p => p.endsWith('.md')).sort());
  const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
  for (const match of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'site', match[1])));
});
