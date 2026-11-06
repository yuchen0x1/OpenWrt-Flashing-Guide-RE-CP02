'use strict';
'require view';
'require poll';
'require rpc';
'require fs';

/*
 * 状态面板：iStoreOS 风格的硬件监控页（RE-CP-02 自制）。
 * - 物理网口状态图：按 network.device status 实时渲染 WAN/LAN 各口的
 *   连接/速率，插拔网线 5 秒内反映到页面；
 * - 实时资源：CPU 占用（/proc/stat 采样差分）、内存占用、负载、
 *   全部物理口合计收发速率（两次轮询差分）。
 * 端口名按 DSA 命名（wan/lan1..lan4）自动发现，找不到 DSA 口时回退
 * eth0/eth1（旧 swconfig 布局），适配不同固件版本。
 * ACL：见 root/usr/share/rpcd/acl.d/luci-app-status-panel.json。
 */

var callDeviceStatus = rpc.declare({
	object: 'network.device',
	method: 'status',
	expect: { '': {} }
});

var callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info',
	expect: { '': {} }
});

var callSystemBoard = rpc.declare({
	object: 'system',
	method: 'board',
	expect: { '': {} }
});

/* 展示候选与顺序：优先 DSA 口名，回退传统 eth 口名；实际渲染按存在的设备过滤 */
var PORT_HINTS = [
	{ dev: 'wan', label: 'WAN' },
	{ dev: 'lan1', label: 'LAN1' },
	{ dev: 'lan2', label: 'LAN2' },
	{ dev: 'lan3', label: 'LAN3' },
	{ dev: 'lan4', label: 'LAN4' },
	{ dev: 'eth0', label: 'ETH0', fallback: true },
	{ dev: 'eth1', label: 'ETH1', fallback: true }
];

var POLL_INTERVAL = 5;

function fmtUptime(sec) {
	sec = Math.max(0, Math.floor(sec || 0));
	var d = Math.floor(sec / 86400);
	var h = Math.floor((sec % 86400) / 3600);
	var m = Math.floor((sec % 3600) / 60);
	if (d > 0) {
		return d + ' 天 ' + h + ' 小时 ' + m + ' 分';
	}
	if (h > 0) {
		return h + ' 小时 ' + m + ' 分';
	}
	return m + ' 分钟';
}

function fmtRate(bytesPerSec) {
	var v = Math.max(0, bytesPerSec || 0);
	if (v >= 1048576) {
		return (v / 1048576).toFixed(2) + ' MB/s';
	}
	if (v >= 1024) {
		return (v / 1024).toFixed(1) + ' KB/s';
	}
	return Math.round(v) + ' B/s';
}

function fmtBytes(bytes) {
	var v = Math.max(0, bytes || 0);
	if (v >= 1073741824) {
		return (v / 1073741824).toFixed(2) + ' GB';
	}
	if (v >= 1048576) {
		return (v / 1048576).toFixed(1) + ' MB';
	}
	if (v >= 1024) {
		return (v / 1024).toFixed(1) + ' KB';
	}
	return Math.round(v) + ' B';
}

/* /proc/stat 第一行差分 → CPU 占用百分比；采样异常返回 null（页面显示 --） */
function cpuUsageFromStat(prev, now) {
	if (!prev || !now) {
		return null;
	}
	var p = String(prev).split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
	var c = String(now).split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
	if (!p.length || !c.length || p.length < 5 || c.length < 5 || p.some(isNaN) || c.some(isNaN)) {
		return null;
	}
	var pIdle = p[3] + p[4], cIdle = c[3] + c[4];           /* idle + iowait */
	var pTotal = p.slice(0, 8).reduce(function(a, b) { return a + b; }, 0);
	var cTotal = c.slice(0, 8).reduce(function(a, b) { return a + b; }, 0);
	var dTotal = cTotal - pTotal, dIdle = cIdle - pIdle;
	if (dTotal <= 0) {
		return null;
	}
	return Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100));
}

/* 从 network.device status 里挑出实际存在的物理口（DSA 口优先，全部缺失才用 eth 回退） */
function pickPorts(devices) {
	var primary = [], fallback = [];
	PORT_HINTS.forEach(function(hint) {
		var d = devices[hint.dev];
		if (!d || typeof d !== 'object') {
			return;
		}
		if (hint.fallback) {
			fallback.push({ dev: hint.dev, label: hint.label, info: d });
		} else {
			primary.push({ dev: hint.dev, label: hint.label, info: d });
		}
	});
	return primary.length ? primary : fallback;
}

function bar(pct) {
	pct = Math.min(100, Math.max(0, pct || 0));
	return E('div', { 'class': 'sp-bar' }, [
		E('div', { 'class': 'sp-bar-fill', 'style': 'width:' + pct.toFixed(1) + '%' }),
		E('span', { 'class': 'sp-bar-text' }, pct.toFixed(1) + '%')
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callSystemBoard(), {}),
			L.resolveDefault(fs.read('/etc/openwrt_release'), '')
		]);
	},

	render: function(data) {
		var board = data[0] || {};
		var rel = {};
		String(data[1] || '').split('\n').forEach(function(line) {
			var m = line.match(/^(DISTRIB_[A-Z_]+)='?([^']*)'?$/);
			if (m) {
				rel[m[1]] = m[2];
			}
		});
		this._cpuPrev = null;
		this._trafficPrev = null;

		var style = document.createElement('style');
		style.textContent = [
			'.sp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 1em 0; }',
			'.sp-card { padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); }',
			'.sp-card h5 { margin: 0 0 6px; font-size: 78%; letter-spacing: .08em; opacity: .6; text-transform: uppercase; }',
			'.sp-card .sp-val { font-size: 1.25rem; font-weight: 700; word-break: break-all; }',
			'.sp-card .sp-sub { font-size: 80%; opacity: .65; margin-top: 2px; }',
			'.sp-ports { display: flex; flex-wrap: wrap; gap: 18px; margin: 1em 0; padding: 18px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }',
			'.sp-port { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 72px; }',
			'.sp-jack { width: 40px; height: 30px; border-radius: 5px; border: 2px solid #64748b; position: relative; background: rgba(127,127,127,.15); }',
			'.sp-jack::after { content: ""; position: absolute; left: 50%; top: 50%; width: 14px; height: 10px; transform: translate(-50%, -50%); border-radius: 2px; border: 1px solid currentColor; opacity: .5; }',
			'.sp-port.sp-up .sp-jack { border-color: #22c55e; background: rgba(34,197,94,.15); box-shadow: 0 0 10px rgba(34,197,94,.35); }',
			'.sp-port.sp-up .sp-jack::after { border-color: #22c55e; opacity: .9; }',
			'.sp-port.sp-up .sp-name { color: #4ade80; }',
			'.sp-name { font-weight: 700; font-size: 90%; }',
			'.sp-meta { font-size: 76%; opacity: .7; text-align: center; }',
			'.sp-bars { display: grid; gap: 10px; margin-top: .6em; }',
			'.sp-bar { position: relative; height: 22px; border-radius: 8px; background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.1); overflow: hidden; }',
			'.sp-bar-fill { height: 100%; background: linear-gradient(90deg,#8b5cf6,#6366f1,#22d3ee); border-radius: 8px 0 0 8px; transition: width .6s ease; }',
			'.sp-bar-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 80%; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.4); }',
			'.sp-bar-label { font-size: 85%; opacity: .75; margin-bottom: -4px; }'
		].join('\n');
		document.head.appendChild(style);

		var fwText = rel.DISTRIB_DESCRIPTION || ((rel.DISTRIB_ID || '?') + ' ' + (rel.DISTRIB_RELEASE || '?'));
		var view = this;

		poll.add(L.bind(view.updateState, view), POLL_INTERVAL);

		return E([], [
			E('h2', {}, _('状态面板')),
			E('div', { 'class': 'cbi-map-descr' },
				_('实时硬件监控：物理网口连接状态、CPU / 内存占用与总吞吐速率，每 5 秒自动刷新。'
				+ '网口图数据来自 network.device status（netifd），插拔网线约 5 秒内反映到页面。')),
			E('div', { 'class': 'sp-cards' }, [
				E('div', { 'class': 'sp-card' }, [
					E('h5', {}, _('设备')),
					E('div', { 'class': 'sp-val' }, board.hostname || '?'),
					E('div', { 'class': 'sp-sub' }, board.model || '?')
				]),
				E('div', { 'class': 'sp-card' }, [
					E('h5', {}, _('固件')),
					E('div', { 'class': 'sp-val', 'style': 'font-size:95%' }, fwText),
					E('div', { 'class': 'sp-sub' }, board.release ? (board.release.version || '') : '')
				]),
				E('div', { 'class': 'sp-card' }, [
					E('h5', {}, _('运行时间')),
					E('div', { 'class': 'sp-val', 'id': 'sp-uptime' }, '…')
				]),
				E('div', { 'class': 'sp-card' }, [
					E('h5', {}, _('负载（1/5/15 分钟）')),
					E('div', { 'class': 'sp-val', 'id': 'sp-load' }, '…')
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('物理网口')),
				E('div', { 'class': 'sp-ports', 'id': 'sp-ports' },
					E('div', { 'class': 'sp-meta' }, _('正在读取网口状态…'))),
				E('p', { 'style': 'opacity:.6;font-size:85%;margin:0' },
					_('合计吞吐 ↓ '), E('span', { 'id': 'sp-rx', 'style': 'font-weight:700' }, '--'),
					_('　↑ '), E('span', { 'id': 'sp-tx', 'style': 'font-weight:700' }, '--'))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-title' }, _('实时资源')),
				E('div', { 'class': 'sp-bars' }, [
					E('div', { 'class': 'sp-bar-label' }, _('CPU 占用')),
					E('div', { 'id': 'sp-cpu' }, E('div', { 'class': 'sp-meta' }, '…')),
					E('div', { 'class': 'sp-bar-label' }, _('内存占用')),
					E('div', { 'id': 'sp-mem' }, E('div', { 'class': 'sp-meta' }, '…'))
				])
			])
		]);
	},

	/* 每个轮询周期刷新一次；元素引用按 id 现场查找，兼容主题动画换 DOM */
	updateState: function() {
		var view = this;
		return Promise.all([
			L.resolveDefault(callDeviceStatus(), {}),
			L.resolveDefault(callSystemInfo(), {}),
			fs.read('/proc/stat').catch(function() { return ''; })
		]).then(function(res) {
			var devices = res[0] || {};
			var sys = res[1] || {};

			var uptimeEl = document.getElementById('sp-uptime');
			if (uptimeEl) {
				uptimeEl.textContent = fmtUptime(sys.uptime);
			}

			var loadEl = document.getElementById('sp-load');
			if (loadEl && sys.load && sys.load.length >= 3) {
				loadEl.textContent = sys.load.map(function(l) {
					return (l / 65536).toFixed(2);
				}).join(' / ');
			}

			/* 物理网口图 + 合计吞吐（与上次轮询差分） */
			var ports = pickPorts(devices);
			var portsEl = document.getElementById('sp-ports');
			if (portsEl) {
				portsEl.innerHTML = '';
				if (!ports.length) {
					portsEl.appendChild(E('div', { 'class': 'sp-meta' },
						_('未发现 wan/lan1..4/eth0/eth1 物理口，设备命名可能不同（可编辑 panel.js 的 PORT_HINTS 适配）')));
				} else {
					ports.forEach(function(p) {
						var up = !!p.info.up && p.info.carrier !== false;
						var speed = p.info.link_speed ? (p.info.link_speed + 'M') : '';
						portsEl.appendChild(E('div', { 'class': 'sp-port' + (up ? ' sp-up' : ' sp-down') }, [
							E('div', { 'class': 'sp-jack' }),
							E('div', { 'class': 'sp-name' }, p.label),
							E('div', { 'class': 'sp-meta' }, up ? (speed || _('已连接')) : _('未连接'))
						]));
					});
				}
			}

			var rxNow = 0, txNow = 0;
			ports.forEach(function(p) {
				var st = p.info.statistics || {};
				rxNow += (st.rx_bytes || 0);
				txNow += (st.tx_bytes || 0);
			});
			if (view._trafficPrev && portsEl) {
				var rxEl = document.getElementById('sp-rx');
				var txEl = document.getElementById('sp-tx');
				if (rxEl) {
					rxEl.textContent = fmtRate((rxNow - view._trafficPrev.rx) / POLL_INTERVAL);
				}
				if (txEl) {
					txEl.textContent = fmtRate((txNow - view._trafficPrev.tx) / POLL_INTERVAL);
				}
			}
			view._trafficPrev = { rx: rxNow, tx: txNow };

			/* CPU：/proc/stat 差分 */
			var cpuEl = document.getElementById('sp-cpu');
			if (cpuEl) {
				var cpu = cpuUsageFromStat(view._cpuPrev, res[2]);
				view._cpuPrev = res[2] || view._cpuPrev;
				cpuEl.innerHTML = '';
				cpuEl.appendChild(cpu === null
					? E('div', { 'class': 'sp-meta' }, '…')
					: bar(cpu));
			}

			/* 内存：total - free - buffered - cached（各字段缺失时保守降级） */
			var memEl = document.getElementById('sp-mem');
			if (memEl) {
				var mem = sys.memory || {};
				if (mem.total > 0) {
					var used = mem.total - (mem.free || 0) - (mem.buffered || 0) - (mem.cached || 0);
					var pct = Math.min(100, Math.max(0, (used / mem.total) * 100));
					memEl.innerHTML = '';
					memEl.appendChild(E('div', {}, [
						bar(pct),
						E('div', { 'class': 'sp-meta', 'style': 'margin-top:4px' },
							fmtBytes(mem.total - used) + ' / ' + fmtBytes(mem.total) + _(' 可用'))
					]));
				}
			}

			return Promise.resolve();
		});
	}
});
