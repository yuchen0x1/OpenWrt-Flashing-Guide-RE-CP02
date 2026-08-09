const docs = [
  ['00', '准备工作与文件说明', '设备、固件、工具与风险检查。', '../docs/00-preparation.md'],
  ['01', '接线与电脑网络设置', 'Stock、Recovery 与 OpenWrt 网段切换。', '../docs/01-network-topology.md'],
  ['02', '刷机流程', '备份分区、写入 U-Boot 与 Recovery。', '../docs/02-flashing.md'],
  ['03', 'OpenWrt 首次启动', 'LAN、WAN、WiFi 与 SSH 初始配置。', '../docs/03-first-boot.md'],
  ['04', 'eMMC 扩容到 overlay', '分区、格式化与 overlay 迁移。', '../docs/04-emmc-overlay.md'],
  ['05', '常用服务配置', 'DNS、广告过滤、UPnP、SQM 与 DDNS。', '../docs/05-common-services.md'],
  ['06', 'v2rayA 分流与快捷入口', '代理服务、分流模式与 LuCI 入口。', '../docs/06-v2raya.md'],
  ['07', '常见问题排查', '网络、Recovery、服务与扩容故障。', '../docs/07-troubleshooting.md'],
  ['08', '路由器全球分流恢复', '私密配置恢复与验证路径。', '../docs/08-router-global-access.md']
];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const modal = $('#doc-modal');
const toast = $('#toast');
const fence = String.fromCharCode(96).repeat(3);
let lastFocusedElement = null;
let searchIndexPromise = null;
let searchRequestId = 0;

function normalizeDocPath(path) {
  return path.startsWith('docs/') ? '../' + path : path;
}
function isDocPath(path) {
  const normalized = normalizeDocPath(path);
  return normalized.startsWith('../docs/') && normalized.endsWith('.md');
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const target = href.trim();
      if (isDocPath(target)) {
        return '<a class="text-link" href="#" data-doc-link="' + escapeHtml(normalizeDocPath(target)) + '">' + label + ' ↗</a>';
      }
      if (/^(https?:\/\/|mailto:)/i.test(target)) {
        return '<a class="text-link" href="' + escapeHtml(target) + '" target="_blank" rel="noreferrer">' + label + ' ↗</a>';
      }
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function renderMarkdown(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  let html = '';
  let inCode = false;
  let code = [];
  for (const line of lines) {
    if (line.startsWith(fence)) {
      if (inCode) {
        html += '<pre>' + escapeHtml(code.join('\n')) + '</pre>';
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
    } else if (line.startsWith('### ')) {
      html += '<h3>' + inlineMarkdown(line.slice(4)) + '</h3>';
    } else if (line.startsWith('## ')) {
      html += '<h2>' + inlineMarkdown(line.slice(3)) + '</h2>';
    } else if (line.startsWith('# ')) {
      html += '<h1>' + inlineMarkdown(line.slice(2)) + '</h1>';
    } else if (line.startsWith('> ')) {
      html += '<blockquote>' + inlineMarkdown(line.slice(2)) + '</blockquote>';
    } else if (/^[-*] /.test(line)) {
      html += '<li>' + inlineMarkdown(line.slice(2)) + '</li>';
    } else if (/^\d+\. /.test(line)) {
      html += '<li>' + inlineMarkdown(line.replace(/^\d+\. /, '')) + '</li>';
    } else if (line.trim()) {
      html += '<p>' + inlineMarkdown(line) + '</p>';
    }
  }
  return html.replace(/(<li>.*<\/li>)+/g, list => '<ul>' + list + '</ul>');
}
function titleFor(path) {
  const item = docs.find(doc => doc[3] === normalizeDocPath(path));
  return item ? item[1] : '文档';
}
async function openDoc(path) {
  const resolvedPath = normalizeDocPath(path);
  lastFocusedElement = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  $('#modal-title').textContent = titleFor(resolvedPath);
  $('#modal-body').innerHTML = '<div class="loading">正在读取文档…</div>';
  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    $('#modal-body').innerHTML = renderMarkdown(await response.text());
  } catch (error) {
    $('#modal-body').innerHTML = '<p>无法读取文档：' + escapeHtml(error.message) + '</p>';
  }
}
function closeDoc() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 1600);
}
$('#doc-grid').innerHTML = docs.map(doc => '<button class="doc-card glass-panel" data-doc="' + doc[3] + '" type="button"><span class="doc-index">' + doc[0] + ' / GUIDE</span><h3>' + doc[1] + '</h3><p>' + doc[2] + '</p><span class="doc-arrow">↗</span></button>').join('');
$$('[data-doc]').forEach(button => button.addEventListener('click', () => openDoc(button.dataset.doc)));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', closeDoc));
$('#modal-body').addEventListener('click', event => {
  const link = event.target.closest('[data-doc-link]');
  if (!link) return;
  event.preventDefault();
  openDoc(link.dataset.docLink);
});
$$('a[href^="firmware/"]').forEach(link => { link.href = '../' + link.getAttribute('href'); });
$$('.copy-button').forEach(button => button.addEventListener('click', async event => {
  event.stopPropagation();
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    showToast('SHA256 已复制');
  } catch {
    showToast('复制失败，请手动选择');
  }
}));
$('#all-docs').addEventListener('click', () => $('#docs').scrollIntoView({ behavior: 'smooth' }));
$('#theme-toggle').addEventListener('click', () => {
  const light = !document.body.classList.contains('light-mode');
  document.body.classList.toggle('light-mode', light);
  localStorage.setItem('re-cp-02-theme', light ? 'light' : 'dark');
  $('#theme-toggle').setAttribute('aria-pressed', String(light));
  showToast(light ? '已切换浅色模式' : '已切换深色模式');
});
const savedTheme = localStorage.getItem('re-cp-02-theme');
if (savedTheme === 'light') {
  document.body.classList.add('light-mode');
  $('#theme-toggle').setAttribute('aria-pressed', 'true');
}
const searchModal = $('#search-modal');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
function openSearch() {
  searchModal.classList.add('is-open');
  searchModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  searchInput.focus();
}
function closeSearch() {
  searchModal.classList.remove('is-open');
  searchModal.setAttribute('aria-hidden', 'true');
  if (!modal.classList.contains('is-open')) document.body.classList.remove('modal-open');
  searchInput.value = '';
  searchResults.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
}
$('#search-open').addEventListener('click', openSearch);
$$('[data-close-search]').forEach(element => element.addEventListener('click', closeSearch));
async function getSearchIndex() {
  if (searchIndexPromise) return searchIndexPromise;
  searchIndexPromise = Promise.all(docs.map(async doc => {
    try {
      const response = await fetch(doc[3]);
      return { doc, body: response.ok ? await response.text() : '' };
    } catch {
      return { doc, body: '' };
    }
  }));
  return searchIndexPromise;
}
searchInput.addEventListener('input', async () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    searchResults.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
    return;
  }
  const requestId = ++searchRequestId;
  searchResults.innerHTML = '<p class="search-hint">正在搜索文档正文…</p>';
  const index = await getSearchIndex();
  if (requestId !== searchRequestId) return;
  const matches = index.filter(item => (item.doc.join(' ') + ' ' + item.body).toLowerCase().includes(term)).map(item => item.doc);
  searchResults.innerHTML = matches.length ? matches.map(doc => '<button class="search-result" data-doc="' + doc[3] + '" type="button"><strong>' + doc[1] + '</strong><small>' + doc[3] + ' · ' + doc[2] + '</small></button>').join('') : '<p class="search-hint">没有匹配的章节</p>';
  $$('.search-result').forEach(element => element.addEventListener('click', () => { closeSearch(); openDoc(element.dataset.doc); }));
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    openSearch();
  }
  if (event.key === 'Escape') {
    closeDoc();
    closeSearch();
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
