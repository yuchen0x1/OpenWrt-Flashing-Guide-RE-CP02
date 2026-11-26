/* =============================================================
 * 站点 Markdown 渲染器（零依赖，纯函数，可单独测试）
 *
 * 从 app.js 抽出的原因：
 *   1. 渲染逻辑是阅读站点的核心，之前混在 460 行的 app.js 里无法单测；
 *   2. 行内解析顺序原来有 bug（链接 → 粗体 → 反引号），代码块里出现
 *      ** / [a](b) 会被当成语法渲染；
 *   3. 抽出后 scripts/check-site-markdown.js 可以直接 require 本文件做回归。
 *
 * 暴露到 window.SiteMarkdown 供 app.js 使用；同时兼容 CommonJS（Node 测试）。
 * ============================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  const DOC_PREFIX = '../docs/';
  const FENCE = String.fromCharCode(96).repeat(3);

  function normalizeDocPath(path) {
    if (/^(?:\.\/)?[\w-]+\.md$/i.test(path)) return DOC_PREFIX + path.replace(/^\.\//, '');
    return path.startsWith('docs/') ? '../' + path : path;
  }

  function isDocPath(path) {
    const normalized = normalizeDocPath(path);
    return normalized.startsWith(DOC_PREFIX) && normalized.endsWith('.md');
  }

  /* ---------- 行内解析 ---------- */

  /**
   * 只处理「非代码」区段：链接 → 自动链接 → 粗体 → 斜体。
   * 输入必须是尚未转义的原始文本片段。
   */
  function inlineEmphasis(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\s][^*]*?)\*([^*]|$)/g, '$1<em>$2</em>$3');
    return html;
  }

  function inlinePlainSegment(text) {
    const links = [];
    let marker = '\u0000';
    while (text.includes(marker)) marker += '\u0000';
    /* Keep generated anchors out of subsequent emphasis and URL parsing. */
    const source = text.replace(/\[([^\]]+)\]\(([^)]+)\)|<(https?:\/\/[^\s<>]+)>|(^|[\s（(])(https?:\/\/[^\s<>"'）)]+)/gi,
      (whole, label, href, auto, lead, bare) => {
        let html;
        if (href !== undefined) {
          const target = href.trim();
          const title = inlineEmphasis(label);
          if (isDocPath(target)) {
            html = '<a class="text-link" href="#" data-doc-link="' + escapeHtml(normalizeDocPath(target)) + '">' + title + '</a>';
          } else if (/^(https?:\/\/|mailto:)/i.test(target)) {
            html = '<a class="text-link" href="' + escapeHtml(target) + '" target="_blank" rel="noreferrer">' + title + '</a>';
          } else {
            html = title;
          }
        } else {
          const url = auto || bare;
          html = escapeHtml(lead || '') + '<a class="text-link" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
            + escapeHtml(auto ? url.replace(/^https?:\/\//i, '') : url) + '</a>';
        }
        return marker + (links.push(html) - 1) + marker;
      });
    return inlineEmphasis(source).replace(new RegExp(marker + '(\\d+)' + marker, 'g'), (whole, index) => links[Number(index)]);
  }

  /**
   * 行内渲染：先按反引号切成「代码段 / 普通段」，代码段整体转义后包 <code>，
   * 只有普通段参与链接与强调解析。这样代码里的 ** 与 [a](b) 才不会被误渲染。
   */
  function inlineMarkdown(value) {
    const source = String(value == null ? '' : value);
    let html = '';
    let index = 0;
    while (index < source.length) {
      const tick = source.indexOf('`', index);
      if (tick === -1) {
        html += inlinePlainSegment(source.slice(index));
        break;
      }
      if (tick > index) {
        html += inlinePlainSegment(source.slice(index, tick));
      }
      const close = source.indexOf('`', tick + 1);
      if (close === -1) {
        /* 落单的反引号按普通字符处理 */
        html += inlinePlainSegment(source.slice(tick));
        break;
      }
      const code = source.slice(tick + 1, close);
      /* 代码段内的 `**` `[x](y)` 一律不解析，只做转义 */
      html += '<code>' + escapeHtml(code) + '</code>';
      index = close + 1;
    }
    return html;
  }

  function stripMarkdown(value) {
    return String(value == null ? '' : value)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1');
  }

  /* ---------- 表格对齐 ---------- */

  const ALIGN_PATTERNS = [
    [/^:?-{3,}:?$/, null]
  ];

  function parseAlignments(separatorLine) {
    const cells = separatorLine.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    return cells.map(cell => {
      const trimmed = cell.trim();
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return null;
    });
  }

  function alignAttr(align) {
    return align ? ' style="text-align:' + align + '"' : '';
  }

  /* ---------- 块级渲染 ---------- */

  function renderMarkdown(source) {
    const lines = String(source == null ? '' : source).replace(/\r/g, '').split('\n');
    let html = '';
    const toc = [];
    let inCode = false;
    let code = [];
    let codeLang = '';
    let listType = null;
    let section = 0;
    let table = null;

    function closeTable() {
      if (table) {
        flushTableHead();
        html += '</tbody></table>';
        table = null;
      }
    }
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
    function renderTableRow(line, header) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      return '<tr>' + cells.map((cell, i) => {
        const tag = header ? 'th' : 'td';
        /* 对齐方式对表头和数据行都生效 */
        const align = table && table.aligns ? table.aligns[i] : null;
        return '<' + tag + alignAttr(align) + '>' + inlineMarkdown(cell) + '</' + tag + '>';
      }).join('') + '</tr>';
    }
    /* 表头在读到分隔行之前不知道对齐方式，所以先缓存原始行，等分隔行到了再输出 */
    function flushTableHead() {
      if (!table || table.headEmitted) return;
      table.headEmitted = true;
      html += '<table><thead>' + renderTableRow(table.headerLine, true) + '</thead><tbody>';
    }
    function emitCode(raw, lang) {
      const langAttr = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
      html += '<div class="code-block"><button class="code-copy" type="button" data-copy="'
        + escapeHtml(raw) + '" aria-label="复制代码">复制</button><pre><code' + langAttr + '>'
        + escapeHtml(raw) + '</code></pre></div>';
    }

    for (const line of lines) {
      if (line.startsWith(FENCE)) {
        if (inCode) {
          emitCode(code.join('\n'), codeLang);
          code = [];
          codeLang = '';
        } else {
          code = [];
          codeLang = line.slice(FENCE.length).trim().split(/\s+/)[0] || '';
        }
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        code.push(line);
        continue;
      }
      if (!line.trim()) {
        closeTable();
        closeList();
      } else if (line.startsWith('#### ')) {
        closeTable();
        closeList();
        html += '<h4>' + inlineMarkdown(line.slice(5)) + '</h4>';
      } else if (line.startsWith('### ')) {
        closeTable();
        closeList();
        html += '<h3>' + inlineMarkdown(line.slice(4)) + '</h3>';
      } else if (line.startsWith('## ')) {
        closeTable();
        closeList();
        toc.push({ id: 'sec-' + section, title: stripMarkdown(line.slice(3)) });
        html += '<h2 id="sec-' + section + '">' + inlineMarkdown(line.slice(3)) + '</h2>';
        section += 1;
      } else if (line.startsWith('# ')) {
        closeTable();
        closeList();
        html += '<h1>' + inlineMarkdown(line.slice(2)) + '</h1>';
      } else if (line.startsWith('> ')) {
        closeTable();
        closeList();
        html += '<blockquote>' + inlineMarkdown(line.slice(2)) + '</blockquote>';
      } else if (/^[-*] /.test(line)) {
        closeTable();
        openList('ul');
        html += '<li>' + inlineMarkdown(line.slice(2)) + '</li>';
      } else if (/^\d+\. /.test(line)) {
        closeTable();
        openList('ol');
        html += '<li>' + inlineMarkdown(line.replace(/^\d+\. /, '')) + '</li>';
      } else if (line.trim() === '---') {
        closeTable();
        closeList();
        html += '<hr>';
      } else if (/^\|.*\|$/.test(line) && /^\|?\s*:?-{3,}/.test(line.replace(/^[|\s]*/, ''))) {
        /* 表头分隔行：记录对齐方式后立刻输出已缓存表头 */
        if (table) {
          table.headerDone = true;
          table.aligns = parseAlignments(line);
          flushTableHead();
        }
      } else if (/^\|.*\|$/.test(line)) {
        if (!table) {
          table = { headerDone: false, headEmitted: false, headerLine: line, aligns: null };
        } else if (!table.headerDone) {
          /* 没有分隔行的表格：把第二行也当表头收进来，避免丢内容 */
          table.headerDone = true;
          flushTableHead();
          html += renderTableRow(line, false);
        } else {
          flushTableHead();
          html += renderTableRow(line, false);
        }
      } else {
        closeTable();
        closeList();
        html += '<p>' + inlineMarkdown(line) + '</p>';
      }
    }
    closeTable();
    closeList();
    if (inCode && code.length) emitCode(code.join('\n'), codeLang);
    return { html, toc };
  }

  return {
    escapeHtml,
    normalizeDocPath,
    isDocPath,
    inlineMarkdown,
    stripMarkdown,
    renderMarkdown
  };
});
