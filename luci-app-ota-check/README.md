# LuCI 更新中心（ota-check）

在 LuCI「系统 → 更新中心」提供一个页面，包装路由器上的 `/usr/bin/ota-check`（自有更新源，见
[`ota/README.md`](../ota/README.md)）：检测新版本、下载镜像并校验 SHA256、展示更新日志。
网页**不提供一键刷写**——下载校验通过后仍需要在 SSH 里执行 `ota-check --flash` 并输入 `YES`。

## 文件

| 仓库路径 | 路由器路径 |
| --- | --- |
| `root/usr/bin/ota-check-ui` | `/usr/bin/ota-check-ui`（需要 `chmod +x`） |
| `root/usr/share/luci/menu.d/luci-app-ota-check.json` | `/usr/share/luci/menu.d/` |
| `root/usr/share/rpcd/acl.d/ota-check.json` | `/usr/share/rpcd/acl.d/` |
| `root/www/luci-static/resources/view/ota-check/update-center5.js` | `/www/luci-static/resources/view/ota-check/` |
| `theme-patch/` | 可选：给 argon 主题加固件版本行，见 [theme-patch/README.md](theme-patch/README.md) |

页面依赖两份可执行文件：`/usr/bin/ota-check`（检测脚本本体）和 `/usr/bin/ota-check-ui`（后台
包装器）。**缺 `ota-check` 时菜单项会被 `depends.fs` 隐藏**，这是有意设计，避免页面点了没反应。

## 部署

先在电脑的仓库根目录起临时 HTTP 服务（路由器要能访问这台电脑）：

```sh
python -m http.server 18767 --bind 0.0.0.0
```

然后在路由器 SSH 中执行——`<PC_IP>` 换成电脑地址：

```sh
# 1. 检测脚本本体
uclient-fetch -q -O /usr/bin/ota-check "http://<PC_IP>:18767/scripts/ota-check.sh"

# 2. 后台包装器 + 菜单 + ACL + 视图
uclient-fetch -q -O /usr/bin/ota-check-ui "http://<PC_IP>:18767/luci-app-ota-check/root/usr/bin/ota-check-ui"
mkdir -p /www/luci-static/resources/view/ota-check
uclient-fetch -q -O /usr/share/luci/menu.d/luci-app-ota-check.json "http://<PC_IP>:18767/luci-app-ota-check/root/usr/share/luci/menu.d/luci-app-ota-check.json"
uclient-fetch -q -O /usr/share/rpcd/acl.d/ota-check.json "http://<PC_IP>:18767/luci-app-ota-check/root/usr/share/rpcd/acl.d/ota-check.json"
uclient-fetch -q -O /www/luci-static/resources/view/ota-check/update-center5.js "http://<PC_IP>:18767/luci-app-ota-check/root/www/luci-static/resources/view/ota-check/update-center5.js"

# 3. 两个脚本都必须可执行，否则 fs.exec 直接失败
chmod +x /usr/bin/ota-check /usr/bin/ota-check-ui

# 4. 清菜单缓存并重载 rpcd（ACL 只有重启 rpcd 才生效）
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd restart
```

浏览器 Ctrl+F5，菜单「系统 → 更新中心」。

> 走本仓库文件时 LF 已在 `.gitattributes` 里强制；如果是自己用 Windows 记事本改过再上传，
> 先确认没有 CRLF——BusyBox ash 会在首行 `set -u` 报 `Illegal option` 直接退出。

## 部署校验

```sh
ls -l /usr/bin/ota-check /usr/bin/ota-check-ui     # 两行都要有 x 位
ubus call luci getFeatures | grep -c ota-check     # 非 0 表示 ACL 已加载
/usr/bin/ota-check --help | head -3                # 能打印用法说明脚本本身可用
```

页面打开后如果一直显示「后台任务未产生输出（超时）」：

1. `ls -l /tmp/ota-check-ui.out` 看文件是否生成；
2. 手动执行 `/usr/bin/ota-check-ui`，正常应立刻返回「已启动后台检测」；
3. `logread | grep ota-check` 看真正的错误（证书、DNS、GitHub 不可达等）。

## 更新源

页面顶部可切换 GitHub（主源）与 Gitee（备用源），选择存在浏览器 `localStorage` 的
`re-cp-02-ota-source`。URL 常量在 `scripts/ota-check.sh` 顶部，也可用环境变量
`OTA_MANIFEST_URL` 覆盖成任意 manifest 地址。

## 发布约定

- 改 `update-center5.js` 必须**换文件名并同步 `menu.d` 的 `view.path`**：uhttpd 对
  `/luci-static/` 资源按 URL 启发式强缓存，不改文件名浏览器会继续跑旧代码。
- 改 `ota-check-ui` 或 `ota-check.sh` 后，`.gitattributes` 保证 LF 检出，但仍需重新 `chmod +x`。

## 卸载

```sh
rm -f /usr/bin/ota-check /usr/bin/ota-check-ui \
      /usr/share/luci/menu.d/luci-app-ota-check.json \
      /usr/share/rpcd/acl.d/ota-check.json
rm -rf /www/luci-static/resources/view/ota-check
rm -f /tmp/luci-indexcache* /tmp/ota-check-ui.out /tmp/ota-check-ui.lock
/etc/init.d/rpcd restart
```
