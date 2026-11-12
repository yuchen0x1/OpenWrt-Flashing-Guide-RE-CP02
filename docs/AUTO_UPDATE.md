# 自动更新与发布

本文档说明本项目真正支持的在线更新边界。项目不是 Electron、Tauri 或移动应用，没有可静默替换的桌面安装包；它由静态阅读站点、LuCI 页面和 OpenWrt shell 脚本组成。因此本项目采用 **GitHub 主分支 OTA 清单 + OpenWrt 端人工确认刷写 + GitHub 标签发布快照**，而不是套用 `latest.yml` 或 Tauri 更新 JSON。

## 1. 架构和更新边界

```text
main/ota/manifest.json
        │ HTTPS raw 文件
        ▼
路由器 ota-check.sh / LuCI 更新中心
        │ 下载、重试、文件大小 + SHA-256、设备/发行版门禁
        ▼
用户 SSH 输入 YES 后执行 sysupgrade

vMAJOR.MINOR.PATCH 标签
        │ GitHub Actions
        ├─ 静态检查与自动更新回归
        ├─ 生成 OTA 清单审计快照
        ├─ 生成源代码 tar.gz 与 SHA256SUMS
        └─ 正式标签创建 GitHub Release
```

`ota/manifest.json` 是设备更新的唯一入口。它只记录上游 ImmortalWrt 镜像的真实 HTTPS 地址、版本、大小和 SHA-256；固件二进制不提交到本仓库。更新检测默认只读，网页端不会直接刷写。

项目标签使用 `vMAJOR.MINOR.PATCH`（例如 `v1.4.1`），表示本仓库脚本/文档快照版本；OTA 版本继续沿用上游固件版本（例如 `24.10.6`），两者不能混用。

## 2. 已研究的成熟实现

| 实现 | 可复用设计 | 本项目是否采用 |
| --- | --- | --- |
| OpenWrt `sysupgrade` / Firmware Selector | 按设备型号选择镜像、刷写前校验、升级与配置保留边界 | 采用设备/发行版门禁和人工 `sysupgrade`；不自动远程刷写 |
| GitHub Releases + Actions | 标签驱动构建、Release 资产、最小权限、校验文件 | 采用标签构建源代码快照、OTA 快照和 `SHA256SUMS.txt` |
| RAUC | 更新包签名、设备兼容性和回滚状态机 | 仅作为安全对照；本项目没有 RAUC 设备槽位和签名密钥，不能伪造接入 |
| fwupd LVFS | 元数据清单、硬件匹配、签名验证、发布渠道 | 仅作为清单/签名对照；路由器镜像仍由 ImmortalWrt 官方 CDN 提供 |

参考资料：

- [OpenWrt sysupgrade CLI](https://openwrt.org/docs/guide-user/installation/sysupgrade.cli) 与 [Firmware Selector](https://firmware-selector.openwrt.org/)；
- [GitHub Actions 发布 Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)；
- [RAUC 官方文档](https://rauc.readthedocs.io/en/latest/)；
- [fwupd/libfwupdplugin 官方文档](https://fwupd.github.io/libfwupdplugin/)。

它们都强调“先匹配设备，再验证来源/完整性，最后安装”；这也是本项目保留人工刷写确认的原因。

## 3. 运行时能力

路由器端 `scripts/ota-check.sh` 和 `luci-app-ota-check` 已支持：

- GitHub raw / Gitee 双源，或通过 `OTA_MANIFEST_URL` 指定源；
- 当前版本、目标版本和稳定版 `latest` 比较；
- 网络失败自动重试，失败不影响当前固件继续运行；
- HTTPS 地址、SHA-256 格式、正整数文件大小、设备型号和发行版门禁；
- 下载到临时目录后先校验大小和 SHA-256，再允许人工执行 `sysupgrade`；
- 并发锁、残留锁接管和固定临时文件防护；
- 网页端显示检测/下载进度，但没有“网页一键刷写”按钮。

当前不支持且不会伪造支持：

- 桌面应用静默安装、退出时重启、安装器回滚：NOT APPLICABLE；
- 固件数字签名：BLOCKED。当前没有发布签名私钥、设备端公钥信任根或官方签名链；仅使用 HTTPS + SHA-256 + 人工确认；
- 在线真实设备刷写、eMMC/温度/无线回归：BLOCKED，必须连接真实 RE-CP-02 并由用户确认风险。

## 4. 发布新版本

### 4.1 更新设备 OTA 清单

1. 从 ImmortalWrt 官方发布目录取得对应设备的镜像和 `sha256sums`。
2. 在 `ota/manifest.json` 追加 `releases[]`，填入真实的 `version`、HTTPS `sysupgrade.url`、`sha256` 和 `size`。
3. 只有稳定版本才能成为 `latest`，并设置 `recommended: true`。
4. 本地运行：

```powershell
node scripts/check-consistency.js --verbose
node scripts/check-auto-update.js
```

5. 通过 Pull Request 合并到 `main`。合并后路由器下次检测会读取 `main/ota/manifest.json`。

### 4.2 发布项目快照

标签必须是 `vMAJOR.MINOR.PATCH`，并且只在 `main` 的已审查提交上创建：

```powershell
git switch main
git pull --ff-only origin main
git tag v1.4.1
git push origin v1.4.1
```

`.github/workflows/release.yml` 会执行完整检查，生成：

- `OpenWrt-Flashing-Guide-RE-CP02-vX.Y.Z.tar.gz`；
- `ota-manifest-vX.Y.Z.json`（包含清单快照、提交号和签名未配置的明确状态）；
- `SHA256SUMS.txt`。

正式标签推送会创建 GitHub Release；手动运行工作流只构建并上传 Actions artifact，不创建 Release。工作流不会上传伪造固件，也不会替换已有 Release。

## 5. 更新源与故障处理

设备端默认使用 GitHub raw：

```sh
ota-check --source github
```

GitHub 不可达时可切换 Gitee：

```sh
ota-check --source gitee
```

下载失败会重试；清单不存在、地址不是 HTTPS、哈希格式错误、大小不匹配、哈希不匹配、设备型号不符或发行版不符时，流程立即停止，旧固件保持可用。不要删除旧镜像后再尝试安装，也不要跳过 SHA-256 校验。跨大版本升级前先备份 `/etc`，并按对应文档决定是否使用 `-n`。

## 6. 本地测试和外部验收

自动更新回归不连接真实路由器、不执行刷写，覆盖：版本相同/新/旧、预发布版本、网络失败重试、持续断网、损坏文件 SHA-256、错误地址和错误清单。运行：

```powershell
node scripts/check-auto-update.js
```

CI 还会运行 `check-consistency.js`、LuCI/站点回归、JSON/链接检查和 shell 语法检查。真实 GitHub Release、下载 CDN、数字签名、设备刷写必须在对应外部条件具备后验证；本地通过不等于这些外部动作已经发生。

## 7. 维护者检查表

- [ ] 变更只在 `main` 上完成并通过 CI；
- [ ] `latest`、`releases[]`、版本、URL、大小和 SHA-256 相互一致；
- [ ] 没有提交固件二进制、密钥、Token、订阅或私人配置；
- [ ] 标签符合 `vMAJOR.MINOR.PATCH`；
- [ ] Release 资产的 `SHA256SUMS.txt` 可独立验证；
- [ ] 若以后启用签名，私钥放入 GitHub Secrets，设备端只内置公钥，并新增签名失败拒绝测试；
- [ ] 真实设备刷写仍由人工确认，并保留备份和回滚路径。
