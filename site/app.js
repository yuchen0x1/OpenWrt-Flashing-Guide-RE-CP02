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
const loadDocText = window.GuideTools.createTextLoader(window.fetch.bind(window));
let searchRequestId = 0;
let currentDocIndex = -1;
let docRequestId = 0;
let loadedDocPath = null;

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
  if (modal.classList.contains('is-open') && bodyEl && loadedDocPath) {
    writeReadingProgress(loadedDocPath, bodyEl.scrollTop);
  }
}
async function openDoc(path, section = '') {
  const resolvedPath = normalizeDocPath(path);
  if (!docs.some(doc => doc[3] === resolvedPath) && resolvedPath !== '../firmware/README.md') return;
  const requestId = ++docRequestId;
  saveCurrentDocProgress();
  loadedDocPath = null;
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
    const rendered = renderMarkdown(await loadDocText(resolvedPath));
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
    loadedDocPath = resolvedPath;
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
    if (/^sec-\d+$/.test(section)) {
      const target = document.getElementById(section);
      if (target) {
        target.classList.add('search-target');
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
  } catch (error) {
    if (requestId !== docRequestId) return;
    $('#modal-body').innerHTML = '<p role="alert">无法读取文档：' + escapeHtml(error.message) + '</p><button class="button button-quiet" id="doc-retry" type="button">重新读取</button>';
    $('#doc-retry').addEventListener('click', () => openDoc(resolvedPath, section));
  }
}
function closeDoc() {
  /* 关闭前记录当前滚动位置（按文档路径持久化） */
  saveCurrentDocProgress();
  loadedDocPath = null;
  ++docRequestId;
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
const themeButton = $('#theme-toggle');
const themeOrder = ['auto', 'light', 'dark'];
const themeIcons = { auto: '◐', light: '☀', dark: '☾' };
const themeLabels = { auto: '跟随系统', light: '浅色', dark: '深色' };
function readThemeMode() {
  try {
    const value = localStorage.getItem('re-cp-02-theme');
    return themeOrder.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}
function systemPrefersLight() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}
function applyThemeMode(mode, announce = false) {
  const light = mode === 'light' || (mode === 'auto' && systemPrefersLight());
  document.body.classList.toggle('light-mode', light);
  document.body.dataset.themeMode = mode;
  themeButton.textContent = themeIcons[mode];
  themeButton.title = '主题模式：' + themeLabels[mode] + '（点击切换）';
  themeButton.setAttribute('aria-label', '主题模式：' + themeLabels[mode]);
  themeButton.setAttribute('aria-pressed', String(mode === 'light'));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#edf1ec' : '#0d0f12');
  if (announce) showToast('已切换为' + themeLabels[mode]);
}
let themeMode = readThemeMode();
applyThemeMode(themeMode);
themeButton.addEventListener('click', () => {
  themeMode = themeOrder[(themeOrder.indexOf(themeMode) + 1) % themeOrder.length];
  try {
    localStorage.setItem('re-cp-02-theme', themeMode);
  } catch {
    // 隐私模式/禁用存储下无法持久化，模式仅在本次会话生效
  }
  applyThemeMode(themeMode, true);
});
if (window.matchMedia) {
  const colorScheme = window.matchMedia('(prefers-color-scheme: light)');
  const onSchemeChange = () => { if (themeMode === 'auto') applyThemeMode('auto'); };
  if (colorScheme.addEventListener) colorScheme.addEventListener('change', onSchemeChange);
  else if (colorScheme.addListener) colorScheme.addListener(onSchemeChange);
}

/* Vantage-style section context: keep the rail, bottom bar, and breadcrumb
   synchronized with the section currently visible in the reading guide. */
const sectionNames = { top: '总览', journey: '流程', firmware: '固件', docs: '文档' };
const sectionLinks = $$('[data-section-link]');
const breadcrumbCurrent = $('#breadcrumb-current');
function setActiveSection(id) {
  sectionLinks.forEach(link => {
    const active = link.dataset.sectionLink === id;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = sectionNames[id] || sectionNames.top;
}
const sectionTargets = Object.keys(sectionNames)
  .map(id => document.getElementById(id))
  .filter(Boolean);
if ('IntersectionObserver' in window && sectionTargets.length) {
  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActiveSection(visible.target.id);
  }, { threshold: [0.12, 0.35, 0.65], rootMargin: '-16% 0px -56% 0px' });
  sectionTargets.forEach(section => sectionObserver.observe(section));
}
sectionLinks.forEach(link => link.addEventListener('click', () => setActiveSection(link.dataset.sectionLink)));
const railToggle = $('#rail-toggle');
if (railToggle) {
  railToggle.addEventListener('click', () => {
    const pinned = document.body.classList.toggle('rail-pinned');
    railToggle.setAttribute('aria-pressed', String(pinned));
    showToast(pinned ? '导航栏已固定展开' : '导航栏已收起');
  });
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
  ++searchRequestId;
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
  if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) {
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
  return Promise.all(docs.map(async doc => {
    try {
      return window.GuideTools.indexDocument(doc, await loadDocText(doc[3]));
    } catch {
      return { doc, entries: [], failed: true };
    }
  }));
}
async function runSearch() {
  /* 先作废在途请求：清空输入后旧响应仍会回来，不递增代次就会把已清空的列表重新写满 */
  const requestId = ++searchRequestId;
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    searchResults.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
    return;
  }
  searchResults.innerHTML = '<p class="search-hint">正在搜索…</p>';
  const index = await getSearchIndex();
  if (requestId !== searchRequestId || !searchModal.classList.contains('is-open')) return;
  /* 每篇文档收集命中行（最多 6 条），再整体拼接，按文档顺序排列 */
  const totalLimit = 30;
  const matches = window.GuideTools.searchDocuments(index, term, totalLimit);
  const total = matches.reduce((sum, item) => sum + item.hits.length, 0);
  const groups = matches.map(item => {
    const groupHead = '<div class="search-group-title">' + escapeHtml(item.doc[1]) + '</div>';
    const groupBody = item.hits.map(hit => '<button class="search-result" data-doc="' + item.doc[3] + '" data-section="' + hit.section + '" type="button"><small>第 ' + hit.no + ' 行 · 打开所在章节</small><span class="snippet">' + snippetFor(hit.line, term) + '</span></button>').join('');
    return groupHead + groupBody;
  });
  searchResults.innerHTML = groups.length
    ? groups.join('') + (total >= totalLimit ? '<p class="search-hint">已展示前 ' + total + ' 条，请输入更具体关键词缩小范围</p>' : '')
    : '<p class="search-hint">没有找到匹配内容</p>';
  const failed = index.filter(item => item.failed).length;
  if (failed) {
    searchResults.insertAdjacentHTML('afterbegin', '<div class="search-hint" role="status">' + failed + ' 篇文档读取失败，搜索结果不完整。<button id="search-retry" class="button button-quiet small-button" type="button">重试失败文档</button></div>');
    $('#search-retry').addEventListener('click', runSearch);
  }
  $$('.search-result').forEach(element => element.addEventListener('click', () => { closeSearch(); openDoc(element.dataset.doc, element.dataset.section); }));
}
searchInput.addEventListener('input', runSearch);
document.addEventListener('keydown', event => {
  if (searchModal.classList.contains('is-open')) {
    trapDialogFocus(event, searchModal);
  } else if (modal.classList.contains('is-open')) {
    trapDialogFocus(event, modal);
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key === '/' && !event.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
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
