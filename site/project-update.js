(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) {
    root.ProjectUpdate = api;
    const start = () => api.mount(root.document, root.fetch.bind(root));
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PROJECT = 'OpenWrt-Flashing-Guide-RE-CP02';
  const RELEASES = 'https://github.com/yuchen0x1/' + PROJECT + '/releases/tag/v';
  const REMOTE = 'https://raw.githubusercontent.com/yuchen0x1/' + PROJECT + '/main/project-version.json';

  function parseVersion(version) {
    if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new Error('Invalid project version');
    }
    const parts = version.split('.').map(Number);
    if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid project version');
    return parts;
  }

  function compareVersions(a, b) {
    const left = parseVersion(a);
    const right = parseVersion(b);
    for (let i = 0; i < 3; i++) {
      if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    }
    return 0;
  }

  function validateManifest(value) {
    if (!value || value.schema !== 1 || value.project !== PROJECT) throw new Error('Invalid project manifest');
    parseVersion(value.version);
    if (value.releaseUrl !== RELEASES + value.version) throw new Error('Invalid project release URL');
    return { version: value.version, releaseUrl: value.releaseUrl };
  }

  async function fetchManifest(fetcher, url, timeoutMs = 8000) {
    const controller = new AbortController();
    let timer;
    const request = Promise.resolve().then(() => fetcher(url, {
      signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error'
    })).then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).then(text => {
      if (text.length > 16384) throw new Error('Project manifest is too large');
      return validateManifest(JSON.parse(text));
    });
    try {
      return await Promise.race([request, new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Project update check timed out'));
        }, timeoutMs);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkUpdate(fetcher, timeoutMs) {
    const current = await fetchManifest(fetcher, '../project-version.json', timeoutMs);
    const latest = await fetchManifest(fetcher, REMOTE, timeoutMs);
    return { current, latest, available: compareVersions(latest.version, current.version) > 0 };
  }

  function mount(doc, fetcher, options = {}) {
    const container = doc.querySelector('[data-project-update]');
    if (!container) return null;
    const status = container.querySelector('[data-project-update-status]');
    const button = container.querySelector('[data-project-update-check]');
    const link = container.querySelector('[data-project-update-link]');
    if (!status || !button || !link) return null;
    let state = 'idle';
    let result = null;
    function render() {
      const english = /^en(?:-|$)/i.test(doc.documentElement.lang);
      const version = result ? result.current.version : container.dataset.projectVersion;
      const prefix = (english ? 'Project v' : '\u9879\u76ee\u7248\u672c v') + version;
      const messages = english
        ? { idle: '', checking: 'Checking for updates...', current: 'Up to date', error: 'Update check failed. Retry when online.' }
        : { idle: '', checking: '\u6b63\u5728\u68c0\u67e5\u66f4\u65b0\u2026', current: '\u5df2\u662f\u6700\u65b0\u7248\u672c', error: '\u68c0\u67e5\u5931\u8d25\uff0c\u8bf7\u8054\u7f51\u540e\u91cd\u8bd5' };
      const available = state === 'available' && result;
      const detail = available
        ? (english ? 'New version: v' : '\u53d1\u73b0\u65b0\u7248\u672c\uff1av') + result.latest.version
        : messages[state];
      status.textContent = prefix + (detail ? ' \u00b7 ' + detail : '');
      button.disabled = state === 'checking';
      button.textContent = state === 'error'
        ? (english ? 'Retry' : '\u91cd\u8bd5')
        : (english ? 'Check for updates' : '\u68c0\u67e5\u66f4\u65b0');
      link.hidden = !available;
      if (available) {
        link.href = result.latest.releaseUrl;
        link.textContent = english ? 'View release' : '\u67e5\u770b\u65b0\u7248\u672c';
      }
      container.setAttribute('aria-busy', state === 'checking' ? 'true' : 'false');
    }
    async function check() {
      if (state === 'checking') return;
      state = 'checking';
      render();
      try {
        result = await checkUpdate(fetcher, options.timeoutMs);
        state = result.available ? 'available' : 'current';
      } catch {
        state = 'error';
      }
      render();
    }
    button.addEventListener('click', check);
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(render);
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    render();
    const ready = check();
    return { check, ready };
  }

  return { parseVersion, compareVersions, validateManifest, fetchManifest, checkUpdate, mount };
});
