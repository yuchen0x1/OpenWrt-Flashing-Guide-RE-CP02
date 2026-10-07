'use strict';
'require view';
'require fs';
'require ui';

/*
 * 固件更新源检测页：包装 /usr/bin/ota-check（自有更新源，见仓库 ota/README.md）。
 * 检测通过 ota-check-ui 包装器后台执行，页面轮询 /tmp/ota-check-ui.out，
 * 避免 rpcd file exec 长阻塞导致按钮永远转圈。
 * 更新日志读自 ota-check 每次检测保存的 /tmp/ota-manifest.json。
 * 节点引用在点击时按 id 现场查找，避免主题动画换 DOM 后引用失效。
 * 网页只提供「检测」与「下载校验」；刷写动作保留在 SSH 的 ota-check --flash，
 * 需要人工输入 YES 确认——这是有意的安全边界。
 */

var OUT_FILE = '/tmp/ota-check-ui.out';
var MANIFEST_FILE = '/tmp/ota-manifest.json';

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
	var btn = ev.target;
	btn.disabled = true;
	setOut(busyText);
	setBadge('…');

	return fs.exec('/usr/bin/ota-check-ui', args || []).then(function() {
		return pollResult(60);
	}).catch(function(e) {
		setBadge('执行失败', 'label-danger');
		setOut('执行失败: ' + e.message);
	}).finally(function() {
		btn.disabled = false;
	});
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
	/* 按版本号新→旧展示，不受 manifest 收录顺序影响 */
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
	/* 展示清单数据日期：路由器读的是上次检测时缓存的 /tmp/ota-manifest.json，过期一眼可见 */
	if (m.generated)
		box.appendChild(E('p', { 'style': 'opacity:.55;font-size:12px;margin:0 0 8px' },
			_('更新源清单生成于 ') + m.generated + _('（上次检测时的本地缓存，点「检测更新」刷新）')));
	box.appendChild(E('ul', { 'style': 'list-style:none;padding-left:0' }, items));
}

function refreshChangelog() {
	return L.resolveDefault(fs.read(MANIFEST_FILE), '').then(function(txt) {
		renderChangelog(document.getElementById('ota-changelog'), txt);
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
		}, '点击「检测更新」从自有更新源拉取版本清单。');

		var changelogBox = E('div', { 'id': 'ota-changelog' });
		renderChangelog(changelogBox, data[2]);

		var infoTable = E('table', { 'class': 'table' }, [
			E('tr', {}, [E('td', { 'width': '33%' }, _('设备')), E('td', {}, [model])]),
			E('tr', {}, [E('td', {}, _('当前固件')), E('td', {}, [rel.DISTRIB_DESCRIPTION || ((rel.DISTRIB_ID || '?') + ' ' + (rel.DISTRIB_RELEASE || '?'))])]),
			E('tr', {}, [E('td', {}, _('更新源')), E('td', {}, [E('code', {}, 'gitee.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02 (ota/manifest.json)')])]),
			E('tr', {}, [E('td', {}, _('自动检测')), E('td', {}, [_('每天 09:00 自动检测并写入系统日志（logread | grep ota-check）')])])
		]);

		return E([], [
			E('h2', {}, _('更新中心')),
			E('div', { 'class': 'cbi-map-descr' },
				_('以本仓库 ota/manifest.json 为版本发布点：检测更新、下载并校验 SHA256。'
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
						'href': L.url('admin/system/backup')
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
						'click': function(ev) { handleRun(ev, [], '正在后台检测，结果将显示在下方…'); }
					}, _('检测更新')),
					' ',
					E('button', {
						'class': 'btn cbi-button',
						'click': function(ev) { handleRun(ev, ['--download'], '正在后台下载镜像并校验 SHA256（约 10MB，请稍候）…'); }
					}, _('下载镜像（不刷写）')),
					' ',
					E('button', {
						'class': 'btn cbi-button',
						'click': function(ev) { handleRun(ev, ['--version', '23.05.7'], '正在后台检测 23.05.7…'); }
					}, _('检测 23.05.7（保守分支）'))
				]),
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
