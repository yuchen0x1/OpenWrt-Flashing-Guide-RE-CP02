# LuCI 插件中心（plugin-hub）

在 LuCI「服务」菜单下提供一个"插件中心"页面，把本机已安装插件功能的入口集中为按钮卡片：

- 内部设置页（Transmission、Samba、DLNA、去广告、流量统计、UPnP、WOL、KMS、微信推送）当前页跳转；
- 独立端口的网页界面（Transmission :9091、文件管理器 :8989、网页终端 :7681）打开新标签页。

纯静态跳转页，不调用任何 rpcd/ubus 接口，无需 ACL 配置。

## 文件

| 文件 | 部署位置 |
| --- | --- |
| `root/usr/share/luci/menu.d/luci-app-plugin-hub.json` | `/usr/share/luci/menu.d/` |
| `root/www/luci-static/resources/view/plugin-hub/dashboard.js` | `/www/luci-static/resources/view/plugin-hub/` |

## 部署

```sh
# 电脑：仓库根目录起临时服务
python -m http.server 18767 --bind 0.0.0.0
# 路由器：<PC_IP> 换成电脑地址
uclient-fetch -q -O /usr/share/luci/menu.d/luci-app-plugin-hub.json "http://<PC_IP>:18767/luci-app-plugin-hub/root/usr/share/luci/menu.d/luci-app-plugin-hub.json"
mkdir -p /www/luci-static/resources/view/plugin-hub
uclient-fetch -q -O /www/luci-static/resources/view/plugin-hub/dashboard.js "http://<PC_IP>:18767/luci-app-plugin-hub/root/www/luci-static/resources/view/plugin-hub/dashboard.js"
rm -f /tmp/luci-indexcache*   # 刷新 LuCI 菜单缓存，浏览器 Ctrl+F5
```

增删按钮：编辑 `dashboard.js` 顶部的 `HUB_ITEMS` 数组，`href` 为 LuCI 内部路径（`internal: true`），或 `port`/`path` 指向独立端口的网页界面（`internal: false`）。PassWall/插件升级不会覆盖本页面；卸载直接删除上面两个文件并清缓存。
