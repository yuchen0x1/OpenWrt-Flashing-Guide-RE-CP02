/* Shared, dependency-free data helpers for the reader and local file verifier. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GuideTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_FILE_SIZE = 64 * 1024 * 1024;

  function parseChecksums(source) {
    const files = new Map();
    for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const match = /^([a-f\d]{64}) [ *]([^\r\n]+)$/i.exec(line);
      if (!match || /[\\/\x00-\x1f]/.test(match[2]) || files.has(match[2])) {
        throw new Error('SHA256 清单格式无效或文件名重复');
      }
      files.set(match[2], match[1].toLowerCase());
    }
    if (!files.size) throw new Error('SHA256 清单为空');
    return [...files].map(([name, sha256]) => ({ name, sha256 }));
  }

  async function hashFile(file, subtle) {
    if (!file || !file.size) throw new Error('请选择非空文件');
    if (file.size > MAX_FILE_SIZE) throw new Error('文件超过 64 MiB，请使用系统 SHA256 工具校验');
    if (!subtle) throw new Error('浏览器不支持安全摘要，请通过 localhost 或 HTTPS 访问');
    const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function compareFile(file, digest, expected) {
    if (digest !== expected.sha256) return 'mismatch';
    return file.name === expected.name ? 'match' : 'renamed';
  }

  function createTextLoader(fetcher, timeoutMs = 12000) {
    const cache = new Map();
    return function loadText(path) {
      if (cache.has(path)) return cache.get(path);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const pending = Promise.resolve().then(() => fetcher(path, { signal: controller.signal }))
        .then(response => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        }).catch(error => {
          cache.delete(path);
          throw error.name === 'AbortError' ? new Error('读取超时，请重试') : error;
        }).finally(() => clearTimeout(timer));
      cache.set(path, pending);
      return pending;
    };
  }

  function indexDocument(doc, body) {
    let section = -1;
    let inCode = false;
    const entries = body.replace(/\r/g, '').split('\n').map((line, i) => {
      if (line.startsWith('```')) inCode = !inCode;
      if (!inCode && line.startsWith('## ')) section++;
      return { line, lower: line.toLowerCase(), no: i + 1, section: section >= 0 ? 'sec-' + section : '' };
    });
    return { doc, entries };
  }

  function searchDocuments(index, term, limit = 30) {
    term = term.trim().toLowerCase();
    if (!term) return [];
    const ordered = [...index].sort((a, b) => Number(b.doc[1].toLowerCase().includes(term)) - Number(a.doc[1].toLowerCase().includes(term)));
    const groups = [];
    let count = 0;
    for (const item of ordered) {
      if (count >= limit) break;
      const hits = item.entries.filter(entry => entry.lower.includes(term)).slice(0, Math.min(6, limit - count));
      if (!hits.length && item.doc[1].toLowerCase().includes(term)) hits.push({ line: item.doc[1], no: 0, section: '' });
      if (hits.length) { groups.push({ doc: item.doc, hits }); count += hits.length; }
    }
    return groups;
  }

  return { MAX_FILE_SIZE, parseChecksums, hashFile, compareFile, createTextLoader, indexDocument, searchDocuments };
});
