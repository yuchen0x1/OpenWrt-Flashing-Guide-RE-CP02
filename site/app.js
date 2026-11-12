const docs = [
  ['00', '准备工作与文件说明', '设备、固件、工具与风险检查。', '../docs/00-preparation.md'],
  ['01', '接线与电脑网络设置', 'Stock、Recovery 与 OpenWrt 网段切换。', '../docs/01-network-topology.md'],
  ['02', '刷机流程', '备份分区、写入 U-Boot 与 Recovery。', '../docs/02-flashing.md'],
  ['03', 'OpenWrt 首次启动', 'LAN、WAN、WiFi 与 SSH 初始配置。', '../docs/03-first-boot.md'],
  ['04', 'eMMC 扩容到 overlay', '分区、格式化与 overlay 迁移。', '../docs/04-emmc-overlay.md'],
  ['05', '常用服务配置', 'DNS、广告过滤、UPnP、SQM 与 DDNS。', '../docs/05-common-services.md'],
  ['06', 'v2rayA 分流与快捷入口', '代理服务、分流模式与 LuCI 入口。', '../docs/06-v2raya.md'],
  ['07', '常见问题排查', '网络、Recovery、服务与扩容故障。', '../docs/07-troubleshooting.md'],
  ['08', '路由器全球分流恢复', '私密配置恢复与验证路径。', '../docs/08-router-global-access.md'],
  ['09', '官方更新、备份与回滚', '官方固件升级、配置备份与失败恢复。', '../docs/09-official-upgrade.md'],
  ['10', '在线自动更新与发布', 'OTA 清单、标签发布、校验和外部验收边界。', '../docs/AUTO_UPDATE.md']
];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const modal = $('#doc-modal');
const toast = $('#toast');
/* Markdown 渲染器已抽到 site/markdown.js（可单测），这里只做取值与前置断言 */
if (!window.SiteMarkdown) {
  throw new Error('site/markdown.js 未加载：请确认 index.html 里它在 app.js 之前');
}
const markdown = window.SiteMarkdown;
const escapeHtml = markdown.escapeHtml;
const stripMarkdown = markdown.stripMarkdown;
const normalizeDocPath = markdown.normalizeDocPath;
const isDocPath = markdown.isDocPath;
const inlineMarkdown = markdown.inlineMarkdown;
const renderMarkdown = markdown.renderMarkdown;

let lastFocusedElement = null;
let searchIndexPromise = null;
let searchRequestId = 0;
let currentDocIndex = -1;
let docRequestId = 0;

function snippetFor(line, term) {
  const plain = stripMarkdown(line).trim();
  const index = plain.toLowerCase().indexOf(term);
  if (index === -1) return escapeHtml(plain.length > 120 ? plain.slice(0, 120) + '…' : plain);
  const start = Math.max(0, index - 34);
  const end = Math.min(plain.length, index + term.length + 66);
  const before = escapeHtml((start > 0 ? '…' : '') + plain.slice(start, index));
  const hit = '<mark>' + escapeHtml(plain.slice(index, index + term.length)) + '</mark>';
  const after = escapeHtml(plain.slice(index + term.length, end) + (end < plain.length ? '…' : ''));
  return before + hit + after;
}

function titleFor(path) {
  const item = docs.find(doc => doc[3] === normalizeDocPath(path));
  return item ? item[1] : path === '../firmware/README.md' ? 'Firmware 文件说明' : '文档';
}
function saveCurrentDocProgress() {
  const bodyEl = $('#modal-body');
  if (modal.classList.contains('is-open') && bodyEl && currentDocIndex > -1) {
    writeReadingProgress(docs[currentDocIndex][3], bodyEl.scrollTop);
  }
}
async function openDoc(path) {
  const resolvedPath = normalizeDocPath(path);
  const requestId = ++docRequestId;
  saveCurrentDocProgress();
  const wasOpen = modal.classList.contains('is-open');
  currentDocIndex = docs.findIndex(doc => doc[3] === resolvedPath);
  if (!wasOpen) lastFocusedElement = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  $('#modal-title').textContent = titleFor(resolvedPath);
  $('#modal-body').innerHTML = '<div class="loading">正在读取文档…</div>';
  /* 焦点必须落在可聚焦元素上：遮罩层 div 没有 tabindex，focus() 是空操作 */
  if (!wasOpen) $('#modal-title').focus();
  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const rendered = renderMarkdown(await response.text());
    if (requestId !== docRequestId) return;
    const nav = currentDocIndex > -1
      ? '<nav class="doc-pager" aria-label="文档翻页">'
        + (currentDocIndex > 0 ? '<button class="doc-prev" type="button" data-doc="' + docs[currentDocIndex - 1][3] + '"><small>上一篇</small><b>' + escapeHtml(docs[currentDocIndex - 1][1]) + '</b></button>' : '<span></span>')
        + (currentDocIndex < docs.length - 1 ? '<button class="doc-next" type="button" data-doc="' + docs[currentDocIndex + 1][3] + '"><small>下一篇</small><b>' + escapeHtml(docs[currentDocIndex + 1][1]) + '</b></button>' : '<span></span>')
        + '</nav>'
      : '';
    const tocBlock = rendered.toc.length
      ? '<details class="doc-toc"><summary>目录 · ' + rendered.toc.length + ' 节</summary><div class="doc-toc-list">'
        + rendered.toc.map(item => '<button type="button" data-toc="' + item.id + '">' + escapeHtml(item.title) + '</button>').join('')
        + '</div></details>'
      : '';
    $('#modal-body').innerHTML = tocBlock + '<div class="doc-content">' + rendered.html + '</div>' + nav;
    $$('.doc-pager [data-doc]').forEach(button => button.addEventListener('click', () => openDoc(button.dataset.doc)));
    $$('.doc-toc-list [data-toc]').forEach(button => button.addEventListener('click', () => {
      const target = $('#' + button.dataset.toc, $('#modal-body'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    /* 翻页会替换整个 modal-body，原来获焦的按钮已脱离文档；把焦点交还标题，
       否则键盘用户和读屏器会停在 <body> 上 */
    if (wasOpen) $('#modal-title').focus();
    const bodyEl = $('#modal-body');
    /* 阅读进度持久化：打开时恢复上次滚动位置（若在合法范围内） */
    const saved = readReadingProgress(resolvedPath);
    bodyEl.scrollTop = 0;
    if (saved > 0 && saved < bodyEl.scrollHeight) {
      bodyEl.scrollTop = saved;
    }
  } catch (error) {
    if (requestId !== docRequestId) return;
    $('#modal-body').innerHTML = '<p>无法读取文档：' + escapeHtml(error.message) + '</p>';
  }
}
function closeDoc() {
  /* 关闭前记录当前滚动位置（按文档路径持久化） */
  const bodyEl = $('#modal-body');
  if (bodyEl && currentDocIndex > -1) {
    writeReadingProgress(docs[currentDocIndex][3], bodyEl.scrollTop);
  }
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (lastFocusedElement && lastFocusedElement.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
  lastFocusedElement = null;
}
function readingStoreKey(path) {
  return 're-cp-02-progress:' + path;
}
function readReadingProgress(path) {
  try {
    return parseInt(localStorage.getItem(readingStoreKey(path)) || '0', 10) || 0;
  } catch {
    return 0;
  }
}
function writeReadingProgress(path, top) {
  try {
    if (typeof top === 'number' && top > 0) {
      localStorage.setItem(readingStoreKey(path), String(Math.round(top)));
    } else {
      localStorage.removeItem(readingStoreKey(path));
    }
  } catch {
    /* 隐私模式/禁用存储下无法持久化，忽略 */
  }
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 1600);
}
$('#doc-grid').innerHTML = docs.map(doc => '<article class="doc-card glass-panel" data-doc="' + doc[3] + '" tabindex="0" role="button" aria-label="' + escapeHtml(doc[1]) + '"><span class="doc-number">' + doc[0] + '</span><h3>' + escapeHtml(doc[1]) + '</h3><p>' + escapeHtml(doc[2]) + '</p><span class="doc-link">阅读 <b>↗</b></span></article>').join('');
$$('[data-doc]').forEach(card => card.addEventListener('click', event => {
  if (card.tagName === 'A') event.preventDefault();
  openDoc(card.dataset.doc);
}));
$$('[data-doc]').forEach(card => card.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openDoc(card.dataset.doc);
  }
}));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', closeDoc));
$('#modal-body').addEventListener('click', event => {
  const link = event.target.closest('[data-doc-link]');
  if (!link) return;
  event.preventDefault();
  openDoc(link.dataset.docLink);
});
$('#modal-body').addEventListener('click', async event => {
  const button = event.target.closest('.code-copy');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = '已复制';
    setTimeout(() => { button.textContent = '复制'; }, 1400);
    showToast('代码已复制');
  } catch {
    showToast('复制失败，请手动选择');
  }
});
$$('.copy-button').forEach(button => button.addEventListener('click', async event => {
  event.stopPropagation();
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    showToast('SHA256 已复制');
  } catch {
    showToast('复制失败，请手动选择');
  }
}));
$('#all-docs').addEventListener('click', () => openDoc(docs[0][3]));
$('#theme-toggle').addEventListener('click', () => {
  const light = !document.body.classList.contains('light-mode');
  document.body.classList.toggle('light-mode', light);
  try {
    localStorage.setItem('re-cp-02-theme', light ? 'light' : 'dark');
  } catch {
    // 隐私模式/禁用存储下无法持久化，模式仅在本次会话生效
  }
  $('#theme-toggle').setAttribute('aria-pressed', String(light));
  showToast(light ? '已切换浅色模式' : '已切换深色模式');
});
let savedTheme = null;
try {
  savedTheme = localStorage.getItem('re-cp-02-theme');
} catch {
  // 同上：存储不可用时按默认深色继续
}
if (savedTheme === 'light') {
  document.body.classList.add('light-mode');
  $('#theme-toggle').setAttribute('aria-pressed', 'true');
}
const searchModal = $('#search-modal');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
let searchOpener = null;
function openSearch() {
  if (searchModal.classList.contains('is-open')) return;
  searchOpener = document.activeElement;
  searchModal.classList.add('is-open');
  searchModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  searchInput.focus();
}
function closeSearch() {
  if (!searchModal.classList.contains('is-open')) return;
  searchModal.classList.remove('is-open');
  searchModal.setAttribute('aria-hidden', 'true');
  if (!modal.classList.contains('is-open')) document.body.classList.remove('modal-open');
  searchInput.value = '';
  searchResults.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
  if (searchOpener && searchOpener.isConnected && typeof searchOpener.focus === 'function') searchOpener.focus();
  searchOpener = null;
}

function focusableElements(root) {
  return $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
    .filter(element => element.offsetParent !== null || element === document.activeElement);
}

function trapDialogFocus(event, dialog) {
  if (event.key !== 'Tab' || !dialog) return;
  const elements = focusableElements(dialog);
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

$('#search-open').addEventListener('click', openSearch);
$$('[data-close-search]').forEach(element => element.addEventListener('click', closeSearch));
async function getSearchIndex() {
  if (searchIndexPromise) return searchIndexPromise;
  searchIndexPromise = Promise.all(docs.map(async doc => {
    try {
      const response = await fetch(doc[3]);
      const body = response.ok ? await response.text() : '';
      /* 逐行索引，附带行号便于定位；同一文档内的命中按行序收集 */
      const lines = body.replace(/\r/g, '').split('\n');
      const entries = [];
      for (let i = 0; i < lines.length; i++) {
        entries.push({ line: lines[i], lower: lines[i].toLowerCase(), no: i + 1 });
      }
      return { doc, entries };
    } catch {
      return { doc, entries: [] };
    }
  }));
  return searchIndexPromise;
}
searchInput.addEventListener('input', async () => {
  /* 先作废在途请求：清空输入后旧响应仍会回来，不递增代次就会把已清空的列表重新写满 */
  const requestId = ++searchRequestId;
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    searchResults.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
    return;
  }
  searchResults.innerHTML = '<p class="search-hint">正在搜索…</p>';
  const index = await getSearchIndex();
  if (requestId !== searchRequestId) return;
  /* 每篇文档收集命中行（最多 6 条），再整体拼接，按文档顺序排列 */
  const perDocLimit = 6;
  const totalLimit = 30;
  const groups = [];
  let total = 0;
  for (const item of index) {
    if (total >= totalLimit) break;
    const hits = [];
    for (const entry of item.entries) {
      if (entry.lower.includes(term)) {
        hits.push(snippetFor(entry.line, term));
        if (hits.length >= perDocLimit) break;
      }
    }
    if (!hits.length) continue;
    const groupHead = '<div class="search-group-title">' + escapeHtml(item.doc[1]) + '</div>';
    const groupBody = hits.map(s => '<button class="search-result" data-doc="' + item.doc[3] + '" type="button"><span class="snippet">' + s + '</span></button>').join('');
    groups.push(groupHead + groupBody);
    total += hits.length;
  }
  searchResults.innerHTML = groups.length
    ? groups.join('') + (total >= totalLimit ? '<p class="search-hint">已展示前 ' + total + ' 条，请输入更具体关键词缩小范围</p>' : '')
    : '<p class="search-hint">没有找到匹配内容</p>';
  $$('.search-result').forEach(element => element.addEventListener('click', () => { closeSearch(); openDoc(element.dataset.doc); }));
});
document.addEventListener('keydown', event => {
  if (searchModal.classList.contains('is-open')) {
    trapDialogFocus(event, searchModal);
  } else if (modal.classList.contains('is-open')) {
    trapDialogFocus(event, modal);
  }
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    openSearch();
  }
  if (event.key === 'Escape') {
    if (searchModal.classList.contains('is-open')) {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    } else if (modal.classList.contains('is-open')) {
      event.preventDefault();
      closeDoc();
    }
  }
});

// Scroll progress + reveal-on-scroll
document.documentElement.classList.add('reveal-enabled');
const progressBar = document.createElement('div');
progressBar.className = 'scroll-progress';
document.body.appendChild(progressBar);
function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
updateProgress();
const revealTargets = document.querySelectorAll('.section, .path-card, .firmware-card, .doc-card, .safety-banner');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  revealTargets.forEach(target => revealObserver.observe(target));
} else {
  revealTargets.forEach(target => target.classList.add('is-visible'));
}
