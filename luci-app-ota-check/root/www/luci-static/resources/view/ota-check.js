'use strict';
'require view';
'require fs';
'require ui';

/*
 * 固件更新源检测页：包装 /usr/bin/ota-check（自有更新源，见仓库 ota/README.md）。
 * 检测通过 ota-check-ui 包装器后台执行，页面轮询 /tmp/ota-check-ui.out，
 * 避免 rpcd file exec 长阻塞导致按钮永远转圈。
 * 节点引用在点击时按 id 现场查找，避免主题动画换 DOM 后引用失效。
 * 网页只提供「检测」与「下载校验」；刷写动作保留在 SSH 的 ota-check --flash，
 * 需要人工输入 YES 确认——这是有意的安全边界。
 */

var OUT_FILE = '/tmp/ota-check-ui.out';

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

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.read('/etc/openwrt_release'), ''),
			L.resolveDefault(fs.read('/tmp/sysinfo/model'), '')
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

		var infoTable = E('table', { 'class': 'table' }, [
			E('tr', {}, [E('td', { 'width': '33%' }, _('设备')), E('td', {}, [model])]),
			E('tr', {}, [E('td', {}, _('当前固件')), E('td', {}, [rel.DISTRIB_DESCRIPTION || ((rel.DISTRIB_ID || '?') + ' ' + (rel.DISTRIB_RELEASE || '?'))])]),
			E('tr', {}, [E('td', {}, _('更新源')), E('td', {}, [E('code', {}, 'gitee.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02 (ota/manifest.json)')])]),
			E('tr', {}, [E('td', {}, _('自动检测')), E('td', {}, [_('每天 09:00 自动检测并写入系统日志（logread | grep ota-check）')])])
		]);

		return E([], [
			E('h2', {}, _('固件更新源')),
			E('div', { 'class': 'cbi-map-descr' },
				_('以本仓库 ota/manifest.json 为版本发布点：检测更新、下载并校验 SHA256。'
				+ '为安全起见，网页不提供一键刷写——下载校验通过后，请在 SSH 中执行 ota-check --flash 并输入 YES 确认。')),
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
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
