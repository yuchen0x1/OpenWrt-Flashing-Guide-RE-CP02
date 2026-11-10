# Argon 主题补丁：侧边栏品牌下方显示固件版本

这两个 .ut 文件是 ImmortalWrt 官方 feed 的 `luci-theme-argon` 模板
（`/usr/share/ucode/luci/template/themes/argon/header.ut` 与 `sysauth.ut`）的修改版，
在品牌名（主机名）下方加了一行小字版本号，内容读自 `/etc/openwrt_release`，随固件升级自动更新。

> 版本基线：补丁相对 **argon 2.4.3** 的模板结构编写。ImmortalWrt 25.12 官方 feed 当前提供
> `2.4.7-r20260824`，两者在这两个文件的品牌区结构一致，可直接覆盖；升级 argon 大版本后请重新比对。

## 何时需要重新打补丁

升级 `luci-theme-argon`（25.12 用 `apk upgrade luci-theme-argon`，24.10 用
`opkg upgrade luci-theme-argon`）会覆盖这两个文件，届时重新上传本目录的版本即可：

```sh
scp luci-app-ota-check/theme-patch/argon-header.ut root@<ROUTER_IP>:/usr/share/ucode/luci/template/themes/argon/header.ut
scp luci-app-ota-check/theme-patch/argon-sysauth.ut root@<ROUTER_IP>:/usr/share/ucode/luci/template/themes/argon/sysauth.ut
```

传完后清模板缓存并重启 Web 服务：

```sh
rm -f /tmp/luci-indexcache*
/etc/init.d/uhttpd restart
```

## 修改内容（相对原版）

- header.ut / sysauth.ut：品牌 `<a class="brand">` 内追加 `<span>` 版本行。
- sysauth.ut：头部追加 `fwver` 常量（`fs.readfile('/etc/openwrt_release')` + 正则提取）。

## ucode 模板注意事项（踩过的坑）

- 字符串没有方法调用：用内置 `trim()`，不要写 `"str".trim()`（会报
  "left-hand side expression is not an array or object"）。
- `match()` 失败返回 null：用 `match(...) || []` 兜底后再 `[1] ?? ''`。
- 插入 `<script>` 的变量一律用 `json(...)` 序列化，不要裸插值——裸插值遇到引号会直接截断脚本。
