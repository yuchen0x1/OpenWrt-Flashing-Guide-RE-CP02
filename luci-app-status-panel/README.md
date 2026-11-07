# LuCI 状态面板（status-panel）

iStoreOS 风格的硬件监控页，在 LuCI「状态」菜单下提供：

- **物理网口状态图**：WAN / LAN 每个口一个"水晶头"图标，绿色发光 = 已连接（旁标协商速率如 `1000M`），灰色 = 未插线。数据来自 `ubus call network.device status`（netifd），插拔网线约 5 秒内反映到页面；
- **实时资源**：CPU 占用（`/proc/stat` 采样差分）、内存占用进度条、负载（1/5/15 分钟）、运行时间；
- **合计吞吐**：所有展示物理口的收发速率（相邻两次轮询差分）；
- **温度（1.4.0 起）**：读 `/sys/class/thermal/thermal_zoneX/temp` 取 CPU 主芯片温度，单位毫度转摄氏度显示；
- **无线客户端数（1.4.0 起）**：优先从 `network.wireless status` 的各无线接口 `stations` 数组统计；固件未提供该字段时通过受 ACL 限制的 `iwinfo.assoclist` ubus 方法查询，失败时显示 `--`。

## 口名适配

 ImmortalWrt 24.10 / 25.12（DSA 内核驱动）的 RE-CP-02 网口名为 `wan` + `lan1..lanN`。
面板按 `wan → lan1..lan4` 顺序自动发现，**全部缺失时回退 `eth0` / `eth1`**（旧 swconfig 布局）。
如果你的固件口名特殊（例如 `eth0.1`），编辑
`panel2.js` 顶部的 `PORT_HINTS` 数组即可，不需要改其他逻辑。

## 文件

| 文件 | 部署位置 |
| --- | --- |
| `root/usr/share/luci/menu.d/luci-app-status-panel.json` | `/usr/share/luci/menu.d/` |
| `root/usr/share/rpcd/acl.d/luci-app-status-panel.json` | `/usr/share/rpcd/acl.d/` |
| `root/www/luci-static/resources/view/status-panel/panel2.js` | `/www/luci-static/resources/view/status-panel/` |

## 部署

```sh
# 电脑：仓库根目录起临时服务
python -m http.server 18767 --bind 0.0.0.0
# 路由器：<PC_IP> 换成电脑地址
uclient-fetch -q -O /usr/share/luci/menu.d/luci-app-status-panel.json "http://<PC_IP>:18767/luci-app-status-panel/root/usr/share/luci/menu.d/luci-app-status-panel.json"
uclient-fetch -q -O /usr/share/rpcd/acl.d/luci-app-status-panel.json "http://<PC_IP>:18767/luci-app-status-panel/root/usr/share/rpcd/acl.d/luci-app-status-panel.json"
mkdir -p /www/luci-static/resources/view/status-panel
uclient-fetch -q -O /www/luci-static/resources/view/status-panel/panel2.js "http://<PC_IP>:18767/luci-app-status-panel/root/www/luci-static/resources/view/status-panel/panel2.js"
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd restart
```

浏览器 Ctrl+F5，菜单「状态 → 状态面板」。部署过旧版（`panel.js`）的先删除旧文件：

```sh
rm -f /www/luci-static/resources/view/status-panel/panel.js
```

## 说明与边界

- 轮询周期 5 秒（`panel2.js` 顶部 `POLL_INTERVAL`），页面切走后 LuCI 自动暂停轮询，不常驻耗资源；
- 只读页面，不改任何配置；ubus 调用为 `network.device status` / `network.wireless status` / `system info` / `system board` / `iwinfo assoclist`，文件读取仅 `/proc/stat`、`/etc/openwrt_release` 与 `/sys/class/thermal/*`，全部在 ACL 白名单内；
- 温度读取依赖设备有 thermal zone（RE-CP-02 的 MT7621 平台有）；某些固件未挂载时显示 `--`；
- DSA 口的 `link_speed` 在未插线时不存在，面板显示「未连接」；
- 主题适配：配色变量随 Glass / 任意 cascade.css 兼容主题自动适配，无硬编码背景。
