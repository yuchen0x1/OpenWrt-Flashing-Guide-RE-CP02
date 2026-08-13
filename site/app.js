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
let currentDocIndex = -1;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function stripMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
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

function normalizeDocPath(path) {
  return path.startsWith('docs/') ? '../' + path : path;
}
function isDocPath(path) {
  const normalized = normalizeDocPath(path);
  return normalized.startsWith('../docs/') && normalized.endsWith('.md');
}
function inlineMarkdown(value) {
  let html = escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const target = href.trim();
      if (isDocPath(target)) {
        return '<a class="text-link" href="#" data-doc-link="' + escapeHtml(normalizeDocPath(target)) + '">' + label + ' ↗</a>';
      }
      if (/^(https?:\/\/|mailto:)/i.test(target)) {
        return '<a class="text-link" href="' + escapeHtml(target) + '" target="_blank" rel="noreferrer">' + label + ' ↗</a>';
      }
      return label;
    });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}
function renderMarkdown(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  let html = '';
  let toc = [];
  let inCode = false;
  let code = [];
  let listType = null;
  let section = 0;
  function closeList() {
    if (listType) {
      html += '</' + listType + '>';
      listType = null;
    }
  }
  function openList(type) {
    if (listType !== type) {
      closeList();
      listType = type;
      html += '<' + type + '>';
    }
  }
  for (const line of lines) {
    if (line.startsWith(fence)) {
      if (inCode) {
        const raw = code.join('\n');
        html += '<div class="code-block"><button class="code-copy" type="button" data-copy="' + escapeHtml(raw) + '" aria-label="复制代码">复制</button><pre><code>' + escapeHtml(raw) + '</code></pre></div>';
        code = [];
      } else {
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
    } else if (!line.trim()) {
      closeList();
    } else if (line.startsWith('### ')) {
      closeList();
      html += '<h3 id="sec-' + section + '">' + inlineMarkdown(line.slice(4)) + '</h3>';
    } else if (line.startsWith('## ')) {
      closeList();
      toc.push({ id: 'sec-' + section, title: stripMarkdown(line.slice(3)) });
      html += '<h2 id="sec-' + section + '">' + inlineMarkdown(line.slice(3)) + '</h2>';
      section += 1;
    } else if (line.startsWith('# ')) {
      closeList();
      html += '<h1>' + inlineMarkdown(line.slice(2)) + '</h1>';
    } else if (line.startsWith('> ')) {
      closeList();
      html += '<blockquote>' + inlineMarkdown(line.slice(2)) + '</blockquote>';
    } else if (/^[-*] /.test(line)) {
      openList('ul');
      html += '<li>' + inlineMarkdown(line.slice(2)) + '</li>';
    } else if (/^\d+\. /.test(line)) {
      openList('ol');
      html += '<li>' + inlineMarkdown(line.replace(/^\d+\. /, '')) + '</li>';
    } else if (line.trim() === '---') {
      closeList();
      html += '<hr>';
    } else {
      closeList();
      html += '<p>' + inlineMarkdown(line) + '</p>';
    }
  }
  closeList();
  if (inCode && code.length) {
    const raw = code.join('\n');
    html += '<div class="code-block"><button class="code-copy" type="button" data-copy="' + escapeHtml(raw) + '" aria-label="复制代码">复制</button><pre><code>' + escapeHtml(raw) + '</code></pre></div>';
  }
  return { html, toc };
}
function titleFor(path) {
  const item = docs.find(doc => doc[3] === normalizeDocPath(path));
  return item ? item[1] : '文档';
}
async function openDoc(path) {
  const resolvedPath = normalizeDocPath(path);
  currentDocIndex = docs.findIndex(doc => doc[3] === resolvedPath);
  lastFocusedElement = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  $('#modal-title').textContent = titleFor(resolvedPath);
  $('#modal-body').innerHTML = '<div class="loading">正在读取文档…</div>';
  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const rendered = renderMarkdown(await response.text());
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
    $('#modal-body').scrollTop = 0;
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
$('#doc-grid').innerHTML = docs.map(doc => '<article class="doc-card glass-panel" data-doc="' + doc[3] + '" tabindex="0" role="button" aria-label="' + escapeHtml(doc[1]) + '"><span class="doc-number">' + doc[0] + '</span><h3>' + escapeHtml(doc[1]) + '</h3><p>' + escapeHtml(doc[2]) + '</p><span class="doc-link">阅读 <b>↗</b></span></article>').join('');
$$('[data-doc]').forEach(card => card.addEventListener('click', () => openDoc(card.dataset.doc)));
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
$('#all-docs').addEventListener('click', () => openDoc(docs[0][3]));
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
  searchResults.innerHTML = '<p class="search-hint">正在搜索…</p>';
  const index = await getSearchIndex();
  if (requestId !== searchRequestId) return;
  const matches = [];
  for (const item of index) {
    const lines = item.body.replace(/\r/g, '').split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes(term)) {
        matches.push({ doc: item.doc, snippet: snippetFor(line, term) });
        if (matches.length >= 24) break;
      }
    }
    if (matches.length >= 24) break;
  }
  searchResults.innerHTML = matches.length
    ? matches.map(match => '<button class="search-result" data-doc="' + match.doc[3] + '" type="button"><strong>' + match.doc[1] + '</strong><span class="snippet">' + match.snippet + '</span></button>').join('')
    : '<p class="search-hint">没有找到匹配内容</p>';
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
