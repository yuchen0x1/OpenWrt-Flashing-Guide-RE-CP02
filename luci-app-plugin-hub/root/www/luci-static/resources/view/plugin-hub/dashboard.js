'use strict';
'require view';

/*
 * 插件中心：为已安装的插件功能提供统一入口按钮。
 * 内部按钮跳转 LuCI 设置页；外部 UI（独立端口）在新标签页打开。
 */

var HUB_ITEMS = [
	{ title: 'Transmission 下载', desc: 'BT/磁力下载，文件保存到 /downloads', href: 'admin/services/transmission', internal: true },
	{ title: 'Transmission 网页版', desc: '直接打开下载管理界面（:9091）', port: 9091, path: '/transmission/', internal: false },
	{ title: '文件管理器', desc: '浏览器管理 55G 空间（:8989，默认 admin/admin，请改密）', port: 8989, path: '/', internal: false },
	{ title: '局域网共享 Samba', desc: '\\\\路由器IP\\downloads 免密共享，手机电脑互传', href: 'admin/nas/samba4', internal: true },
	{ title: 'DLNA 媒体投放', desc: '电视/播放器自动发现 /downloads 里的媒体', href: 'admin/nas/minidlna', internal: true },
	{ title: '去广告', desc: 'adblock-fast：20 万+域名拦截，零常驻内存', href: 'admin/services/adblock-fast', internal: true },
	{ title: '流量统计', desc: '按设备统计上下行流量（nlbwmon）', href: 'admin/services/nlbw', internal: true },
	{ title: '网页终端', desc: 'ttyd 终端，需要路由器账号密码（:7681）', port: 7681, path: '/', internal: false },
	{ title: 'UPnP', desc: '游戏主机/NAT 自动端口映射', href: 'admin/services/upnp', internal: true },
	{ title: '网络唤醒 WOL', desc: '唤醒局域网内支持 Wake-on-LAN 的设备', href: 'admin/services/wol', internal: true },
	{ title: 'KMS 激活', desc: 'vlmcsd 局域网激活服务（:1688）', href: 'admin/services/vlmcsd', internal: true },
	{ title: '微信推送', desc: '状态推送到微信，需先填入自己的推送 Token', href: 'admin/services/wechatpush', internal: true }
];

function hubUrl(item) {
	if (item.internal) {
		return L.url(item.href);
	}
	return window.location.protocol + '//' + window.location.hostname + ':' + item.port + item.path;
}

function hubCard(item) {
	var card = E('a', {
		'class': 'plugin-hub-card cbi-button cbi-button-apply',
		href: hubUrl(item),
		target: item.internal ? '_self' : '_blank',
		rel: 'noopener'
	});
	card.appendChild(E('strong', {}, item.title));
	card.appendChild(E('p', {}, item.desc));
	return card;
}

return view.extend({
	render: function() {
		var style = document.createElement('style');
		style.textContent = [
			'.plugin-hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 1em; }',
			'.plugin-hub-card { display: flex; flex-direction: column; gap: 6px; padding: 14px; text-decoration: none; color: inherit; text-align: left; line-height: 1.5; }',
			'.plugin-hub-card strong { font-size: 110%; }',
			'.plugin-hub-card p { margin: 0; font-size: 90%; opacity: 0.75; white-space: normal; }',
			'.plugin-hub-card:hover { filter: brightness(1.08); }'
		].join('\n');
		document.head.appendChild(style);

		var grid = E('div', { 'class': 'plugin-hub-grid' });
		for (var i = 0; i < HUB_ITEMS.length; i++) {
			grid.appendChild(hubCard(HUB_ITEMS[i]));
		}

		return E([
			E('h2', {}, _('插件中心')),
			E('p', {}, _('已安装功能的统一入口：点击卡片进入对应设置页，独立端口的网页界面会打开新标签页。')),
			grid
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
