'use strict';
'require view';
'require fs';
'require rpc';

/*
 * 插件中心：为已安装的插件功能提供统一入口按钮。
 * 内部按钮跳转 LuCI 设置页；外部 UI（独立端口）在新标签页打开。
 * 状态探测：/etc/init.d 判断「是否安装」，procd 服务列表（ubus service list）
 * 判断「是否运行」；探测被 ACL 拒绝或失败时降级为不显示徽标，不影响跳转。
 * 安全提醒：独立端口的网页界面（ttyd / filebrowser / Transmission 等）默认只应
 * 在局域网访问，切勿在防火墙把这些端口映射到 WAN。
 * 发布约定：视图 JS 改动须换文件名并同步 menu.d（本视图由 dashboard.js 更名而来）。
 */

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	expect: { '': {} }
});

var HUB_ITEMS = [
	{ title: 'Transmission 下载', desc: 'BT/磁力下载，文件保存到 /downloads', href: 'admin/services/transmission', internal: true, init: 'transmission' },
	{ title: 'Transmission 网页版', desc: '直接打开下载管理界面（:9091）', port: 9091, path: '/transmission/', internal: false, init: 'transmission', lanOnly: true },
	{ title: '文件管理器', desc: '浏览器管理 55G 空间（:8989，默认 admin/admin，请改密）', port: 8989, path: '/', internal: false, init: 'filebrowser', lanOnly: true },
	{ title: '局域网共享 Samba', desc: '\\\\路由器IP\\downloads 免密共享，手机电脑互传', href: 'admin/nas/samba4', internal: true, init: 'samba4' },
	{ title: 'DLNA 媒体投放', desc: '电视/播放器自动发现 /downloads 里的媒体', href: 'admin/nas/minidlna', internal: true, init: 'minidlna' },
	{ title: '去广告', desc: 'adblock-fast：20 万+域名拦截，零常驻内存', href: 'admin/services/adblock-fast', internal: true, init: 'adblock-fast' },
	{ title: '流量统计', desc: '按设备统计上下行流量（nlbwmon）', href: 'admin/services/nlbw', internal: true, init: 'nlbwmon' },
	{ title: '网页终端', desc: 'ttyd 终端，需要路由器账号密码（:7681）', port: 7681, path: '/', internal: false, init: 'ttyd', lanOnly: true },
	{ title: 'UPnP', desc: '游戏主机/NAT 自动端口映射', href: 'admin/services/upnp', internal: true, init: 'miniupnpd' },
	{ title: '网络唤醒 WOL', desc: '唤醒局域网内支持 Wake-on-LAN 的设备', href: 'admin/services/wol', internal: true },
	{ title: 'KMS 激活', desc: 'vlmcsd 局域网激活服务（:1688）', href: 'admin/services/vlmcsd', internal: true, init: 'vlmcsd' },
	{ title: '微信推送', desc: '状态推送到微信，需先填入自己的推送 Token', href: 'admin/services/wechatpush', internal: true, init: 'wechatpush' }
];

function hubUrl(item) {
	if (item.internal) {
		return L.url(item.href);
	}
	return window.location.protocol + '//' + window.location.hostname + ':' + item.port + item.path;
}

/* 徽标状态：procd 服务在跑 = 运行中；有 init 脚本但没在跑 = 已停止；连 init 脚本都没有 = 未安装 */
function itemStatus(item, initd, services) {
	if (!item.init || !initd || !services) {
		return null;
	}
	if (services[item.init]) {
		return { cls: 'hub-chip-run', text: '运行中' };
	}
	if (initd[item.init]) {
		return { cls: 'hub-chip-stop', text: '已停止' };
	}
	return { cls: 'hub-chip-absent', text: '未安装' };
}

function hubCard(item, initd, services) {
	var st = itemStatus(item, initd, services);
	var card = E('a', {
		'class': 'plugin-hub-card cbi-button cbi-button-apply'
			+ (st && st.cls === 'hub-chip-absent' ? ' hub-absent' : ''),
		href: hubUrl(item),
		target: item.internal ? '_self' : '_blank',
		rel: 'noopener'
	});
	var head = E('strong', {}, [item.title, ' ']);
	if (st) {
		head.appendChild(E('span', { 'class': 'hub-chip ' + st.cls }, st.text));
	}
	if (item.lanOnly) {
		head.appendChild(E('span', {
			'class': 'hub-chip hub-chip-warn',
			'title': '此页面有独立登录体系甚至 root shell，仅限局域网访问，切勿映射到 WAN'
		}, '仅限局域网'));
	}
	card.appendChild(head);
	card.appendChild(E('p', {}, item.desc));
	return card;
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.list('/etc/init.d'), null).then(function(list) {
				var map = {};
				(list || []).forEach(function(e) {
					if (e && e.name) {
						map[e.name] = true;
					}
				});
				return map;
			}),
			L.resolveDefault(callServiceList(), null)
		]);
	},

	render: function(data) {
		var initd = data[0] || null;
		var services = data[1] || null;

		var style = document.createElement('style');
		style.textContent = [
			'.plugin-hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 1em; }',
			'.plugin-hub-card { display: flex; flex-direction: column; gap: 6px; padding: 14px; text-decoration: none; color: inherit; text-align: left; line-height: 1.5; }',
			'.plugin-hub-card strong { font-size: 110%; }',
			'.plugin-hub-card p { margin: 0; font-size: 90%; opacity: 0.75; white-space: normal; }',
			'.plugin-hub-card:hover { filter: brightness(1.08); }',
			'.plugin-hub-card.hub-absent { opacity: 0.55; }',
			'.hub-chip { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; vertical-align: middle; }',
			'.hub-chip-run { background: rgba(34,197,94,.18); color: #4ade80; border: 1px solid rgba(34,197,94,.4); }',
			'.hub-chip-stop { background: rgba(148,163,184,.18); color: #94a3b8; border: 1px solid rgba(148,163,184,.45); }',
			'.hub-chip-absent { background: rgba(148,163,184,.12); color: #64748b; border: 1px dashed rgba(100,116,139,.5); }',
			'.hub-chip-warn { background: rgba(245,158,11,.14); color: #fbbf24; border: 1px solid rgba(245,158,11,.4); }',
			'.hub-warn { color: #fbbf24; font-size: 90%; margin-top: 4px; }'
		].join('\n');
		document.head.appendChild(style);

		var grid = E('div', { 'class': 'plugin-hub-grid' });
		for (var i = 0; i < HUB_ITEMS.length; i++) {
			grid.appendChild(hubCard(HUB_ITEMS[i], initd, services));
		}

		return E([], [
			E('h2', {}, _('插件中心')),
			E('p', {}, _('已安装功能的统一入口：点击卡片进入对应设置页，独立端口的网页界面会打开新标签页。'
				+ '卡片右上徽标由 init 脚本与 procd 服务列表探测得出；「未安装」表示系统里没有对应的 init 脚本。')),
			E('p', { 'class': 'hub-warn' },
				_('安全提醒：独立端口页面（网页终端、文件管理器、Transmission 等）仅限局域网访问，切勿在防火墙中把这些端口映射到 WAN。')),
			grid
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
