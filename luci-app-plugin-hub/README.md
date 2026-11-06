# LuCI 插件中心（plugin-hub）

在 LuCI「服务」菜单下提供一个"插件中心"页面，把本机已安装插件功能的入口集中为按钮卡片：

- 内部设置页（Transmission、Samba、DLNA、去广告、流量统计、UPnP、WOL、KMS、微信推送）当前页跳转；
- 独立端口的网页界面（Transmission :9091、文件管理器 :8989、网页终端 :7681）打开新标签页。

## 运行状态徽标（1.3.0 起）

每张卡片右上角显示服务状态徽标，由两项探测得出：

| 徽标 | 判定 | 数据来源 |
| --- | --- | --- |
| 🟢 运行中 | 有 init 脚本，且 procd 服务列表里存在同名服务 | `ubus call service list` |
| ⚪ 已停止 | 有 init 脚本，但服务未在 procd 注册 | `/etc/init.d/` 目录 |
| 🔲 未安装 | 连 init 脚本都没有（点击会 404，卡片置灰提示） | `/etc/init.d/` 目录 |

探测被 ACL 拒绝或 rpcd 异常时自动降级为不显示徽标，跳转功能不受影响。

## 安全提醒（页面内常驻）

独立端口的网页界面（网页终端 ttyd、文件管理器、Transmission 等）有独立登录体系甚至
直接暴露 root shell，**仅限局域网访问，切勿在防火墙把这些端口映射到 WAN**。相关卡片
自带「仅限局域网」黄色徽标；刷机后默认清理脚本（`scripts/router-post-flash-cleanup.sh`）
会停用空密码高危的 ttyd。

## 文件

| 文件 | 部署位置 |
| --- | --- |
| `root/usr/share/luci/menu.d/luci-app-plugin-hub.json` | `/usr/share/luci/menu.d/` |
| `root/usr/share/rpcd/acl.d/luci-app-plugin-hub.json` | `/usr/share/rpcd/acl.d/` |
| `root/www/luci-static/resources/view/plugin-hub/dashboard2.js` | `/www/luci-static/resources/view/plugin-hub/` |

## 部署

```sh
# 电脑：仓库根目录起临时服务
python -m http.server 18767 --bind 0.0.0.0
# 路由器：<PC_IP> 换成电脑地址
uclient-fetch -q -O /usr/share/luci/menu.d/luci-app-plugin-hub.json "http://<PC_IP>:18767/luci-app-plugin-hub/root/usr/share/luci/menu.d/luci-app-plugin-hub.json"
uclient-fetch -q -O /usr/share/rpcd/acl.d/luci-app-plugin-hub.json "http://<PC_IP>:18767/luci-app-plugin-hub/root/usr/share/rpcd/acl.d/luci-app-plugin-hub.json"
mkdir -p /www/luci-static/resources/view/plugin-hub
uclient-fetch -q -O /www/luci-static/resources/view/plugin-hub/dashboard2.js "http://<PC_IP>:18767/luci-app-plugin-hub/root/www/luci-static/resources/view/plugin-hub/dashboard2.js"
rm -f /tmp/luci-indexcache*   # 刷新 LuCI 菜单缓存
/etc/init.d/rpcd restart      # 加载新 ACL
```

浏览器 Ctrl+F5。部署过旧版（`dashboard.js`）的先删除旧文件：

```sh
rm -f /www/luci-static/resources/view/plugin-hub/dashboard.js
```

增删按钮：编辑 `dashboard2.js` 顶部的 `HUB_ITEMS` 数组，`href` 为 LuCI 内部路径（`internal: true`），或 `port`/`path` 指向独立端口的网页界面（`internal: false`）。可选字段：

- `init: '服务名'`：状态徽标的探测对象（`/etc/init.d/` 下的脚本名）。文件管理器按手工安装方式可能没有 init 脚本（如用 rc.local 启动），此时会显示「未安装」，按实际情况改掉或删掉 `init` 字段即可；
- `lanOnly: true`：给独立端口卡片加「仅限局域网」徽标。

PassWall/插件升级不会覆盖本页面；卸载直接删除上面三个文件并清缓存。
