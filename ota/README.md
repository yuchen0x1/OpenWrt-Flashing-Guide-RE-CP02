# 自有固件更新源（OTA）

这是一个以本仓库为版本发布点的固件更新源：`manifest.json` 记录 RE-CP-02 可用的固件版本、下载地址和 SHA256，路由器上的 `scripts/ota-check.sh` 读取它来判断「是否有新版本、新版本是什么、哈希是否匹配」。升级检测和校验由本仓库主导，镜像本体默认从 ImmortalWrt 官方 CDN 下载（并逐字节校验哈希），也可以换成把 `.bin` 直接放进本仓库托管。

## 工作方式

```text
仓库 ota/manifest.json          路由器 scripts/ota-check.sh
├─ latest: 最新版本号           ├─ 定时/手动拉取 manifest
├─ releases[]: 每个版本         ├─ 比对 /etc/openwrt_release 当前版本
│   ├─ version / notes          ├─ 比对设备型号（防误刷其他 MT7621 设备）
│   ├─ sysupgrade.url           ├─ （可选）下载镜像到 /tmp
│   └─ sysupgrade.sha256        └─ （可选）校验 SHA256 后提示你手动确认刷写
```

安全设计：

- **检测是只读的**。不带参数运行只做版本比对和日志记录，不下载、不刷写。
- **刷写必须人工确认**。`--flash` 模式在执行 sysupgrade 前要求交互输入 `YES`，且只在你明确传参时才会走到那一步。
- **镜像哈希钉死**。SHA256 记录在 manifest 里，下载后不匹配立即终止，镜像来源被污染也刷不进去。
- **设备型号门禁**。当前设备 `/tmp/sysinfo/model` 不含 `RE-CP-02` 时拒绝下载和刷写；发行版（DISTRIB_ID）与 manifest 的 `distro` 不一致时拒绝刷写（防止跨 fork 自动刷机）。

## 路由器端使用

**网页方式（推荐）**：安装 `luci-app-ota-check`（文件在仓库 `luci-app-ota-check/root/` 目录，含 menu.d / acl.d / 视图 JS / ota-check-ui 包装器）后，LuCI 的 **系统 → 固件更新源** 页面提供「检测更新」「下载镜像（不刷写）」「检测 23.05.7」按钮，检测结果直接显示在页面上。该应用后端仍调用 `ota-check`；为安全起见网页不提供一键刷写，刷写依然走 SSH 人工确认。

**命令行方式**：

```sh
# 安装（路由器需能访问仓库源；先在电脑上执行）
scp scripts/ota-check.sh root@192.168.2.1:/usr/bin/ota-check
ssh root@192.168.2.1 'chmod +x /usr/bin/ota-check'

# 日常：检查是否有更新（只读，写 syslog）
ota-check

# 下载指定版本镜像到 /tmp 并校验 SHA256（不刷写）
ota-check --download --version 24.10.6

# 校验通过后交互确认刷写（默认保留配置；跨大版本建议加 -n 不保留配置）
ota-check --flash --version 24.10.6 --sysupgrade-args="-n"
```

HTTPS 拉取需要 TLS 支持：ImmortalWrt 默认自带 `uclient-fetch`，若提示证书/TLS 错误，安装 `opkg install libustream-mbedtls ca-bundle`，或临时改用 curl。

定时自动检测（每天 9 点检查一次，只记录日志）：

```sh
echo '0 9 * * * /usr/bin/ota-check >/dev/null 2>&1' >> /etc/crontabs/root
/etc/init.d/cron restart
```

检测结果看这里：`logread | grep ota-check`。

## 发布新版本（维护者流程）

1. 确定新版本镜像存在且官方可用（例如 ImmortalWrt 新点版本发布后）。
2. 下载 `immortalwrt-<版本>-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin`，计算 SHA256：`sha256sum 文件名` 或 Windows `certutil -hashfile 文件名 SHA256`。
3. **自托管（可选）**：把 `.bin` 放进本目录 `ota/files/`，URL 写 GitHub raw 地址（`https://raw.githubusercontent.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/main/ota/files/<文件名>`）。注意 GitHub 单文件上限 100MB（超限会被拒推），且把固件二进制提交进仓库与根 README「仓库不含固件二进制」的策略冲突——二选一后请同步更新对应说明。默认方案是 URL 指向 ImmortalWrt 官方 CDN，仓库只存版本号与哈希。
4. 编辑 `manifest.json`：`latest` 指向新版本，`releases[]` 追加新条目（version、notes、url、sha256、size）。
5. 提交并推送到 GitHub。路由器下次检测即感知新版本；若使用 Gitee 备用源，请同步镜像对应分支。

版本号直接沿用上游固件版本（如 `24.10.6`），不另起炉灶，避免两套版本号互相打架。检测脚本只比较 `major.minor.patch` 数字段。

## 与官方 OpenWrt 25.12.5 的关系

本更新源当前只收录 ImmortalWrt 线（与这台路由器当前系统同 fork，配置迁移平滑、PassWall 生态保留）。切换到官方 OpenWrt 25.12.5 属于跨 fork 的人工流程，见 [docs/09-official-upgrade.md](../docs/09-official-upgrade.md)——不要用 ota-check 在跨 fork 之间自动刷写，脚本也会主动拒绝这种情况。
