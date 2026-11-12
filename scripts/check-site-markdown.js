#!/usr/bin/env node
'use strict';
/*
 * 站点 Markdown 渲染器回归（零依赖）。
 *
 * 直接 require site/markdown.js，验证：
 *   1. 行内解析顺序：代码段内的 ** / [a](b) 不得被当成语法渲染（原 bug）
 *   2. <https://...> 自动链接（docs/09 参考资料用的写法，原渲染器完全不支持）
 *   3. 裸 URL 变成链接但不重复包裹
 *   4. 表格对齐（:-- / --: / :-:）
 *   5. h4、语言标记、未闭合代码块、落单反引号等边界
 *   6. 对真实 docs/*.md 全量渲染：不得抛异常、不得产生未转义的 < > 注入
 *
 * 用法：node scripts/check-site-markdown.js
 * 退出码：0 通过  1 失败
 */

const fs = require('fs');
const path = require('path');
const md = require('../site/markdown.js');

const root = path.resolve(__dirname, '..');
const failures = [];
let passes = 0;

function check(name, ok, detail) {
  if (ok) { passes++; console.log('PASS ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

function eq(name, actual, expected) {
  check(name, actual === expected, 'got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected));
}

function has(name, haystack, needle) {
  check(name, String(haystack).includes(needle), 'missing ' + JSON.stringify(needle) + ' in ' + JSON.stringify(String(haystack).slice(0, 160)));
}

function hasNot(name, haystack, needle) {
  check(name, !String(haystack).includes(needle), 'unexpected ' + JSON.stringify(needle));
}

/* ---------- 1. 行内解析顺序（原 bug：代码段被当语法） ---------- */

eq('行内代码里的 ** 不被渲染为粗体',
  md.inlineMarkdown('用 `**bold**` 表示粗体'),
  '用 <code>**bold**</code> 表示粗体');

eq('行内代码里的链接语法不被渲染',
  md.inlineMarkdown('写法 `[a](b)` 会变成链接'),
  '写法 <code>[a](b)</code> 会变成链接');

eq('行内代码里的尖括号被转义',
  md.inlineMarkdown('比较 `a < b`'),
  '比较 <code>a &lt; b</code>');

eq('普通粗体仍然生效',
  md.inlineMarkdown('这是 **重点** 内容'),
  '这是 <strong>重点</strong> 内容');

eq('代码段与粗体混排',
  md.inlineMarkdown('`rm -rf` 很 **危险**'),
  '<code>rm -rf</code> 很 <strong>危险</strong>');

eq('落单反引号按字面处理',
  md.inlineMarkdown('一个 ` 孤立的反引号'),
  '一个 ` 孤立的反引号');

eq('空反引号对不产生空 code 标签以外的破坏',
  md.inlineMarkdown('``'),
  '<code></code>');

/* ---------- 2. 自动链接 ---------- */

has('自动链接 <https://...> 生成 a 标签',
  md.inlineMarkdown('见 <https://openwrt.org/docs/> 说明'),
  '<a class="text-link" href="https://openwrt.org/docs/" target="_blank" rel="noreferrer">openwrt.org/docs/</a>');

hasNot('自动链接不再保留尖括号原文',
  md.inlineMarkdown('见 <https://openwrt.org/> 说明'),
  '&lt;https');

has('裸 URL 变成链接',
  md.inlineMarkdown('参考 https://example.com/x 结束'),
  '<a class="text-link" href="https://example.com/x"');

{
  const once = md.inlineMarkdown('https://example.com/a');
  eq('裸 URL 不被重复包裹', (once.match(/<a /g) || []).length, 1);
}

/* ---------- 3. 文档链接分类 ---------- */

has('站内 docs 链接转成 data-doc-link',
  md.inlineMarkdown('[准备](docs/00-preparation.md)'),
  'data-doc-link="../docs/00-preparation.md"');

has('相对 docs 链接同样识别',
  md.inlineMarkdown('[准备](../docs/00-preparation.md)'),
  'data-doc-link="../docs/00-preparation.md"');

has('外部链接带 rel=noreferrer',
  md.inlineMarkdown('[OpenWrt](https://openwrt.org)'),
  'rel="noreferrer"');

eq('标题锚点退化为纯文本（站内弹窗没有对应元素）',
  md.inlineMarkdown('[跳转](#section-1)'),
  '跳转');

{
  /* 链接语法用非嵌套括号，javascript:alert(1) 会被截成 alert(1，尾括号留在文本里；
     关键是不得生成 href。 */
  const out = md.inlineMarkdown('[奇怪](javascript:alert(1))');
  hasNot('未支持协议不生成 href', out, 'href');
  hasNot('未支持协议不保留 javascript: 在标签里', out, '<a');
  has('未支持协议保留可读文本', out, '奇怪');
}

/* ---------- 4. 表格对齐 ---------- */

{
  const { html } = md.renderMarkdown([
    '| 左 | 中 | 右 |',
    '| :--- | :---: | ---: |',
    '| a | b | c |'
  ].join('\n'));
  has('表格生成 thead', html, '<thead>');
  has('左对齐', html, '<th style="text-align:left">左</th>');
  has('居中对齐', html, '<th style="text-align:center">中</th>');
  has('右对齐', html, '<th style="text-align:right">右</th>');
  has('数据行继承对齐', html, '<td style="text-align:left">a</td>');
  has('表格正确闭合', html, '</tbody></table>');
}

{
  const { html } = md.renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
  hasNot('无对齐标记时不生成 style', html, 'text-align');
}

/* ---------- 5. 块级元素 ---------- */

{
  const { html, toc } = md.renderMarkdown([
    '# 标题一',
    '## 二级',
    '### 三级',
    '#### 四级',
    '',
    '段落 **加粗**',
    '',
    '- 列表项',
    '- 第二项',
    '',
    '1. 有序一',
    '2. 有序二',
    '',
    '> 引用内容',
    '',
    '---',
    '',
    '```sh',
    'echo hi',
    '```'
  ].join('\n'));

  has('h1', html, '<h1>标题一</h1>');
  has('h2 带锚点', html, '<h2 id="sec-0">二级</h2>');
  has('h3', html, '<h3>三级</h3>');
  has('h4 受支持', html, '<h4>四级</h4>');
  has('段落', html, '<p>段落 <strong>加粗</strong></p>');
  has('无序列表', html, '<ul><li>列表项</li><li>第二项</li></ul>');
  has('有序列表', html, '<ol><li>有序一</li><li>有序二</li></ol>');
  has('引用', html, '<blockquote>引用内容</blockquote>');
  has('分隔线', html, '<hr>');
  has('代码块带语言标记', html, '<code class="language-sh">echo hi</code>');
  has('代码块复制按钮', html, 'data-copy="echo hi"');
  check('目录只收 h2', toc.length === 1 && toc[0].title === '二级', JSON.stringify(toc));
}

{
  const { html } = md.renderMarkdown('```\n未闭合代码块');
  has('未闭合代码块仍输出', html, '<pre><code>未闭合代码块</code></pre>');
}

{
  const { html } = md.renderMarkdown('');
  eq('空输入返回空 html', html, '');
}

{
  const { html } = md.renderMarkdown(null);
  eq('null 输入不抛异常', html, '');
}

{
  const { html } = md.renderMarkdown('| 表 |\n| --- |\n| 值 |\n\n段落');
  has('表格后接段落时正确闭合', html, '</tbody></table><p>段落</p>');
}

/* ---------- 6. 安全：不得产生可注入的原始标签 ---------- */

{
  const evil = '<img src=x onerror=alert(1)>';
  const { html } = md.renderMarkdown(evil);
  hasNot('原始 HTML 标签被转义', html, '<img');
  has('转义后的尖括号保留', html, '&lt;img');
}

{
  eq('属性注入被转义',
    md.inlineMarkdown('[x](https://a.com/"onmouseover="alert(1))').includes('onmouseover="alert'),
    false);
}

/* ---------- 7. 真实文档全量渲染 ---------- */

const docFiles = fs.readdirSync(path.join(root, 'docs'))
  .filter(name => name.endsWith('.md'))
  .sort();

let renderedCount = 0;
for (const name of docFiles) {
  const source = fs.readFileSync(path.join(root, 'docs', name), 'utf8');
  let result;
  try {
    result = md.renderMarkdown(source);
    renderedCount++;
  } catch (e) {
    check('渲染 ' + name + ' 不抛异常', false, e.message);
    continue;
  }
  const problems = [];
  /* 输出里不应出现「未匹配的尖括号」——除非是合法标签的一部分 */
  const stripped = result.html.replace(/<[^>]+>/g, '');
  if (/[<>]/.test(stripped)) {
    const m = stripped.match(/.{0,40}[<>].{0,40}/);
    problems.push('未转义的尖括号: ' + JSON.stringify(m && m[0]));
  }
  /* 每条 ## 都应进目录 */
  const h2Count = (source.match(/^## /gm) || []).length;
  if (result.toc.length !== h2Count) {
    problems.push('目录条目 ' + result.toc.length + ' != ## 数量 ' + h2Count);
  }
  if (problems.length) check('渲染 ' + name, false, problems.join('; '));
  else check('渲染 ' + name + '（' + result.toc.length + ' 节）', true);
}

check(`${docFiles.length} 篇文档全部可渲染`, renderedCount === docFiles.length, renderedCount + '/' + docFiles.length);

/* docs/09 的参考资料用 auto-link，必须真的出现链接 */
{
  const source = fs.readFileSync(path.join(root, 'docs/09-official-upgrade.md'), 'utf8');
  const { html } = md.renderMarkdown(source);
  const auto = (html.match(/<a class="text-link" href="https:\/\/openwrt\.org/g) || []).length;
  check('docs/09 的 <https://openwrt.org/...> 自动链接已渲染为可点链接', auto >= 3, 'found ' + auto);
}

console.log('\nSUMMARY pass=' + passes + ' fail=' + failures.length);
if (failures.length) process.exit(1);
