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

## 服务快捷操作（1.4.0 起）

对「已安装」（有 init 脚本）的服务卡片，底部提供「启动 / 停止 / 重启」三个按钮，
通过 `fs.exec` 调用 `/etc/init.d/<name> <action>`，操作完成后自动重读状态徽标。
需要 ACL 允许对 `/etc/init.d/` 下的脚本执行 `file exec`（见下方 ACL 配置）。

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
| `root/www/luci-static/resources/view/plugin-hub/dashboard4.js` | `/www/luci-static/resources/view/plugin-hub/` |

## 部署

```sh
# 电脑：仓库根目录起临时服务
python -m http.server 18767 --bind 0.0.0.0
# 路由器：<PC_IP> 换成电脑地址
uclient-fetch -q -O /usr/share/luci/menu.d/luci-app-plugin-hub.json "http://<PC_IP>:18767/luci-app-plugin-hub/root/usr/share/luci/menu.d/luci-app-plugin-hub.json"
uclient-fetch -q -O /usr/share/rpcd/acl.d/luci-app-plugin-hub.json "http://<PC_IP>:18767/luci-app-plugin-hub/root/usr/share/rpcd/acl.d/luci-app-plugin-hub.json"
mkdir -p /www/luci-static/resources/view/plugin-hub
uclient-fetch -q -O /www/luci-static/resources/view/plugin-hub/dashboard4.js "http://<PC_IP>:18767/luci-app-plugin-hub/root/www/luci-static/resources/view/plugin-hub/dashboard4.js"
rm -f /tmp/luci-indexcache*   # 刷新 LuCI 菜单缓存
/etc/init.d/rpcd restart      # 加载新 ACL
```

浏览器 Ctrl+F5。部署过旧版（`dashboard.js` / `dashboard2.js`）的先删除旧文件：

```sh
rm -f /www/luci-static/resources/view/plugin-hub/dashboard.js \
      /www/luci-static/resources/view/plugin-hub/dashboard2.js
```

增删按钮：编辑 `dashboard4.js` 顶部的 `HUB_ITEMS` 数组，`href` 为 LuCI 内部路径（`internal: true`），或 `port`/`path` 指向独立端口的网页界面（`internal: false`）。可选字段：

- `init: '服务名'`：状态徽标与快捷操作的探测对象（`/etc/init.d/` 下的脚本名）。文件管理器按手工安装方式可能没有 init 脚本（如用 rc.local 启动），此时会显示「未安装」且不出现快捷操作，按实际情况改掉或删掉 `init` 字段即可；
- `lanOnly: true`：给独立端口卡片加「仅限局域网」徽标。

PassWall/插件升级不会覆盖本页面；卸载直接删除上面三个文件并清缓存。


## v1.5.0 可靠性修复（dashboard4）

部署时同时更新 menu.d JSON 和 `dashboard4.js`。新的视图仅在 `fs.exec` 的退出码为 0 时报告已执行；命令失败、RPC 拒绝与状态刷新失败分别提示。同一服务的操作会合并门禁，避免两张关联卡片重复提交。运行徽标依据 procd 实例的 `running` 字段，不能以服务记录存在来判断存活。

旧的 `dashboard3.js` 保留作回退材料，正常菜单不再引用它。`node scripts/check-plugin-hub.js` 验证上述逻辑，但没有替代路由器上的 RPC、权限和实际服务验收。
