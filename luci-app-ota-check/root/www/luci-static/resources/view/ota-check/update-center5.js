'use strict';
'require view';
'require fs';
'require ui';

/*
 * 固件更新源检测页：包装 /usr/bin/ota-check（自有更新源，见仓库 ota/README.md）。
 * 检测通过 ota-check-ui 包装器后台执行，页面轮询 /tmp/ota-check-ui.out，
 * 避免 rpcd file exec 长阻塞导致按钮永远转圈。
 * 包装器带并发锁：重复点击/多标签页触发时返回 OTA_BUSY 且不清空输出文件，
 * 此时直接转入轮询即可看到正在运行任务的实时进度。
 * 更新源（1.4.0 起）：顶部可选 github / gitee，GitHub 为默认主源；检测与下载按钮
 * 自动带上 --source 参数，主源不可达时可切换备用源。
 * 更新日志读自 ota-check 每次检测保存的 /tmp/ota-manifest.json。
 * 版本按钮（1.4.1 起）：按缓存清单动态生成，各版本单独检测，不再硬编码 23.05.7。
 * 节点引用在点击时按 id 现场查找，避免主题动画换 DOM 后引用失效。
 * 网页只提供「检测」与「下载校验」；刷写动作保留在 SSH 的 ota-check --flash，
 * 需要人工输入 YES 确认——这是有意的安全边界。
 * 发布约定：视图 JS 改动须换文件名并同步 menu.d（本视图由 update-center4.js 更名而来）。
 */

var OUT_FILE = '/tmp/ota-check-ui.out';
var MANIFEST_FILE = '/tmp/ota-manifest.json';

var SOURCES = [
	{ id: 'github', name: 'GitHub（主源）' },
	{ id: 'gitee', name: 'Gitee（备用）' }
];
var SOURCE_STORAGE_KEY = 're-cp-02-ota-source';

function readSavedSource() {
	try {
		var saved = localStorage.getItem(SOURCE_STORAGE_KEY);
		return SOURCES.some(function(source) { return source.id === saved; }) ? saved : 'github';
	} catch (e) {
		return 'github';
	}
}

function saveSource(source) {
	try {
		localStorage.setItem(SOURCE_STORAGE_KEY, source);
	} catch (e) {
		/* 隐私模式/禁用存储下按当前页面选择继续 */
	}
}

function setBadge(text, cls) {
	var b = document.getElementById('ota-check-badge');
	if (b) { b.textContent = text; b.className = 'label ' + (cls || ''); }
}

function setOut(text) {
	var p = document.getElementById('ota-check-out');
	if (p) p.textContent = text;
}

function finishResult(text, code) {
	setOut(text || '（无输出）');
	switch (code) {
		case 0: setBadge('已是最新 / 无动作', 'label-success'); break;
		case 1: setBadge('发现可用更新', 'label-warning'); break;
		case 2: setBadge('出错或已取消', 'label-danger'); break;
		case 3: setBadge('镜像已下载并校验通过', 'label-success'); break;
		default: setBadge('退出码 ' + code, 'label-danger');
	}
}

function pollResult(tries) {
	return fs.read(OUT_FILE).then(function(content) {
		content = content || '';
		var m = content.match(/__OTA_DONE_(\d+)__/);
		if (m) {
			finishResult(content.replace(/__OTA_DONE_\d+__\n?/g, ''), parseInt(m[1], 10));
			refreshChangelog();
			return;
		}
		setOut(content);
		if (tries > 0)
			return new Promise(function(r) { setTimeout(r, 1500); }).then(function() { return pollResult(tries - 1); });
		setOut(content + '\n（等待超时，可稍后查看系统日志 logread | grep ota-check）');
		setBadge('超时', 'label-danger');
	}).catch(function() {
		if (tries > 0)
			return new Promise(function(r) { setTimeout(r, 1200); }).then(function() { return pollResult(tries - 1); });
		setBadge('超时', 'label-danger');
		setOut('后台任务未产生输出（超时）');
	});
}

function handleRun(ev, args, busyText) {
	var btn = ev.currentTarget || ev.target;
	btn.disabled = true;
	setOut(busyText);
	setBadge('…');

	return fs.exec('/usr/bin/ota-check-ui', args || []).then(function(res) {
		/* 包装器发现已有后台任务时输出 OTA_BUSY：输出文件归正在运行的任务所有，
		   不清空不重置，直接转入轮询展示其实时进度 */
		if (res && /OTA_BUSY/.test(res.stdout || '')) {
			setBadge('已有任务进行中', 'label-warning');
			setOut('已有检测/下载任务在后台运行，下方实时显示该任务进度…');
		}
		return pollResult(60);
	}).catch(function(e) {
		setBadge('执行失败', 'label-danger');
		setOut('执行失败: ' + e.message);
	}).finally(function() {
		btn.disabled = false;
	});
}

/* 带当前更新源参数的统一触发入口 */
function runWithSource(ev, args, busyText) {
	var sel = document.getElementById('ota-source');
	var source = (sel && sel.value) || 'github';
	var full = ['--source', source].concat(args || []);
	handleRun(ev, full, busyText);
}

/* 版本号降序比较（按 '.' 分段取数值，容忍非数字段） */
function versionDesc(a, b) {
	var ka = String(a || '').split('.'), kb = String(b || '').split('.');
	for (var i = 0; i < Math.max(ka.length, kb.length); i++) {
		var d = (parseInt(kb[i], 10) || 0) - (parseInt(ka[i], 10) || 0);
		if (d) return d;
	}
	return 0;
}

function renderChangelog(box, manifestJson) {
	if (!box) return;
	var m = null;
	try { m = JSON.parse(manifestJson || ''); } catch (e) { m = null; }
	var releases = (m && m.releases) || [];
	if (!releases.length) {
		box.innerHTML = '';
		box.appendChild(E('p', { 'class': 'text-muted' },
			_('暂无更新日志。点击「检测更新」后，这里会列出更新源上每个版本的变更说明。')));
		return;
	}
	releases = releases.slice().sort(function(a, b) { return versionDesc(a.version, b.version); });

	var latest = m.latest || releases[0].version;
	var items = [];
	releases.forEach(function(r) {
		var tags = [];
		if (r.version === latest) tags.push(E('span', { 'class': 'label label-success' }, _('最新')));
		if (r.recommended) tags.push(E('span', { 'class': 'label label-warning' }, _('推荐')));
		var notes = (r.notes || []).map(function(n) { return E('li', {}, n); });
		items.push(E('li', {}, [
			E('strong', {}, [r.version, ' '].concat(tags)),
			r.added ? E('span', { 'style': 'opacity:.55;font-size:12px' }, '　收录于 ' + r.added) : '',
			notes.length ? E('ul', { 'style': 'margin:6px 0 10px' }, notes) : ''
		]));
	});
	box.innerHTML = '';
	if (m.generated)
		box.appendChild(E('p', { 'style': 'opacity:.55;font-size:12px;margin:0 0 8px' },
			_('更新源清单生成于 ') + m.generated + _('（上次检测时的本地缓存，点「检测更新」刷新）')));
	box.appendChild(E('ul', { 'style': 'list-style:none;padding-left:0' }, items));
}

function refreshChangelog() {
	return L.resolveDefault(fs.read(MANIFEST_FILE), '').then(function(txt) {
		renderChangelog(document.getElementById('ota-changelog'), txt);
		renderVersionButtons(document.getElementById('ota-version-buttons'), txt);
	});
}

/* 版本按钮按缓存清单动态生成：清单增删版本时页面自动跟随，不会留下指向已删除版本的死按钮。
   容器由调用方传入：render() 阶段节点还没挂到 document 上，getElementById 会返回 null。 */
function renderVersionButtons(box, manifestJson) {
	if (!box) return;
	var m = null;
	try { m = JSON.parse(manifestJson || ''); } catch (e) { m = null; }
	var releases = (m && m.releases) || [];
	box.innerHTML = '';
	if (!releases.length) {
		box.appendChild(E('span', { 'style': 'opacity:.55;font-size:85%' },
			_('检测指定版本：先点「检测更新」拉取清单。')));
		return;
	}
	box.appendChild(E('span', { 'style': 'opacity:.55;font-size:85%;margin-right:6px' }, _('检测指定版本：')));
	releases.slice().sort(function(a, b) { return versionDesc(a.version, b.version); }).forEach(function(r) {
		box.appendChild(E('button', {
			'class': 'btn cbi-button',
			'style': 'margin:2px 4px 2px 0',
			'click': function(ev) {
				runWithSource(ev, ['--version', r.version], '正在后台检测 ' + r.version + '…');
			}
		}, [ r.version + (r.recommended ? ' ' + _('（推荐）') : '') ]));
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.read('/etc/openwrt_release'), ''),
			L.resolveDefault(fs.read('/tmp/sysinfo/model'), ''),
			L.resolveDefault(fs.read(MANIFEST_FILE), '')
		]);
	},

	render: function(data) {
		var rel = {};
		(data[0] || '').split('\n').forEach(function(line) {
			var m = line.match(/^(DISTRIB_[A-Z_]+)='?([^']*)'?$/);
			if (m) rel[m[1]] = m[2];
		});
		var model = (data[1] || '').trim() || '未知设备';

		var badge = E('span', { 'id': 'ota-check-badge', 'class': 'label' }, '…');
		var outPre = E('pre', {
			'id': 'ota-check-out',
			'style': 'background:#0b0f14; color:#c9d6dd; padding:14px; border-radius:6px; max-height:420px; overflow:auto; font-size:12px; white-space:pre-wrap'
		}, '点击「检测更新」从所选更新源拉取版本清单。');

		var changelogBox = E('div', { 'id': 'ota-changelog' });
		renderChangelog(changelogBox, data[2]);
		var versionButtonsBox = E('div', { 'class': 'cbi-value', 'id': 'ota-version-buttons' });
		renderVersionButtons(versionButtonsBox, data[2]);
		var sourceSelect = E('select', { 'id': 'ota-source', 'class': 'cbi-input-select' },
			SOURCES.map(function(s) {
				return E('option', { 'value': s.id }, s.name);
			}));
		sourceSelect.value = readSavedSource();
		sourceSelect.addEventListener('change', function() {
			saveSource(sourceSelect.value);
		});

		var infoTable = E('table', { 'class': 'table' }, [
			E('tr', {}, [E('td', { 'width': '33%' }, _('设备')), E('td', {}, [model])]),
			E('tr', {}, [E('td', {}, _('当前固件')), E('td', {}, [rel.DISTRIB_DESCRIPTION || ((rel.DISTRIB_ID || '?') + ' ' + (rel.DISTRIB_RELEASE || '?'))])]),
			E('tr', {}, [E('td', {}, _('更新源')), E('td', {}, [sourceSelect])]),
			E('tr', {}, [E('td', {}, _('自动检测')), E('td', {}, [_('每天 09:00 自动检测并写入系统日志（logread | grep ota-check）')])])
		]);

		return E([], [
			E('h2', {}, _('更新中心')),
			E('div', { 'class': 'cbi-map-descr' },
				_('以本仓库 ota/manifest.json 为版本发布点：检测更新、下载并校验 SHA256。'
				+ '更新源默认使用 GitHub，也可切换到 Gitee 备用源。'
				+ '为安全起见，网页不提供一键刷写——下载校验通过后，请在 SSH 中执行 ota-check --flash 并输入 YES 确认。')),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('更新相关入口（整合导航）')),
				E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:8px' }, [
					E('a', {
						'class': 'btn cbi-button cbi-button-action',
						'href': L.url('admin/system/attendedsysupgrade')
					}, _('值守式系统升级（在线定制固件）')),
					' ',
					E('a', {
						'class': 'btn cbi-button',
						'href': L.url('admin/system/flash')
					}, _('备份与更新（本地刷写）')),
					' ',
					E('a', {
						'class': 'btn cbi-button',
						'href': L.url('admin/services/plugin-hub')
					}, _('插件中心'))
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('系统信息')),
				infoTable
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('检测更新 '), badge),
				E('div', { 'class': 'cbi-value' }, [
					E('button', {
						'id': 'ota-check-btn',
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) { runWithSource(ev, [], '正在后台检测，结果将显示在下方…'); }
					}, _('检测更新')),
					' ',
					E('button', {
						'class': 'btn cbi-button',
						'click': function(ev) { runWithSource(ev, ['--download'], '正在后台下载镜像并校验 SHA256（约 10MB，请稍候）…'); }
					}, _('下载镜像（不刷写）'))
				]),
				versionButtonsBox,
				outPre
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('更新日志')),
				changelogBox
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});