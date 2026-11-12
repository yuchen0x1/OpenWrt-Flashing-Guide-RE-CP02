# RE-CP-02 项目进化报告

日期：2026-11-12（Asia/Shanghai）
任务编号：`2026-11-12-recp02-evolution-01`
项目：`E:\移动云盘同步盘\OpenWrt-Flashing-Guide-RE-CP02`
分支：`main`；任务开始 HEAD：`df41b34`

## 1. 原始情况

这是面向 JDCloud RE-CP-02（鲁班二代、r4310、ramips/MT7621）的刷机、恢复和家庭网关配置仓库，不是自动刷机程序。仓库由十一篇 Markdown 指南、零依赖静态阅读站点、三个 LuCI 应用、Glass 主题、OpenWrt/Windows 脚本、OTA manifest 和固件校验清单组成。

原有工程质量较好：已有版本一致性、OTA 视图、PassWall、Markdown、健康检查和 CI；主要残余风险是设备端未验收、Tftpd64 未运行审计，以及 OTA 网页包装器并发锁的实现仍存在文件检查竞态。

## 2. 竞品研究清单

本轮通过 GitHub 搜索得到 18 个候选项目，并深读 5 个项目的 README/源码组织：`openwrt/luci`、`openwrt/openwrt`、`jerrykuku/luci-theme-argon`、`vernesong/OpenClash`、`acecilia/OpenWRTInvasion`。完整地址、许可证状态、研究内容、采用/放弃原因见 [research.json](research.json)。

研究结论：最适合本项目的能力不是引入 Electron/Tauri 等桌面更新框架，而是采用 OpenWrt 的设备/固件匹配与人工 sysupgrade 边界，使用 GitHub Actions/Release 做标签快照和校验资产，并参考 RAUC/fwupd 的清单、签名和回滚安全边界。当前无设备端签名信任根，签名状态必须保持 BLOCKED。

## 3. 功能差距与实际改造

- P1 OTA 网页后台：把非原子“检查锁文件→写 PID”改为原子 `mkdir` 锁目录；并发请求返回 `OTA_BUSY`，不会再同时覆写 `/tmp/ota-check-ui.out`。
- P1 OTA 输入安全：下载前校验 HTTPS、64 位十六进制 SHA256、正数且不超过 32 位安全范围的镜像大小，避免异常清单进入算术表达式和下载路径。
- P2 服务控制：插件中心停止服务前增加确认，降低误停关键服务风险。
- P2 站点可访问性：文档和搜索模态加入 Tab/Shift+Tab 焦点边界；原有 Esc 分层关闭、焦点恢复和异步请求序号逻辑保留。
- P2 工程测试：新增 `scripts/check-ota-wrapper.js`，静态约束锁、完成标记和重定向；Linux/CI 可运行动态双进程回归。
- P1 在线更新发布：新增 `scripts/check-auto-update.js`（12 项回归）、`scripts/build-release-metadata.js`、`.github/workflows/release.yml` 和 `docs/AUTO_UPDATE.md`；标签构建源代码快照、OTA 清单审计快照和 `SHA256SUMS.txt`，正式标签才创建 GitHub Release。
- P1 下载可靠性：`ota-check.sh` 的 curl/wget 重试支持 Range 断点续传，不支持 Range 时回退全量下载；大小与 SHA-256 仍是安装前硬门禁。

没有新增运行依赖，没有复制竞品代码，没有改变固件、分区或自动刷写边界。

## 4. 修改文件

- `.github/workflows/checks.yml`
- `CHANGELOG.md`
- `luci-app-ota-check/root/usr/bin/ota-check-ui`
- `luci-app-plugin-hub/root/www/luci-static/resources/view/plugin-hub/dashboard3.js`
- `scripts/ota-check.sh`
- `scripts/check-ota-wrapper.js`
- `scripts/check-auto-update.js`
- `scripts/build-release-metadata.js`
- `.github/workflows/release.yml`
- `docs/AUTO_UPDATE.md`
- `site/app.js`
- `.evolution/*.json` 与本报告

新增依赖：无。外部上传/发布：无；没有创建真实 Release，也没有伪造固件、签名或设备测试结果。

## 5. 测试与验证

本机已执行并通过：自动更新回归 12/12、版本一致性 15/15、OTA 视图 17/17、PassWall 56/56、站点 Markdown 57/57、Edge 真实交互 9/9、Git whitespace、Node/PowerShell/Bash 语法与项目健康检查（42 pass、0 fail、9 skip）。OTA 包装器静态检查为 10 pass；动态并发分支因 Windows 没有 `/proc` 跳过，已纳入 Linux CI。发布元数据脚本已在本地生成快照，但未上传。

健康检查中的 skip 是已知范围：仓库不包含固件二进制，且测试时未启动默认 HTTP 服务；不将它们伪称为通过。

## 6. 评分（100 分制，按用户要求的权重）

| 维度 | 改造前 | 改造后 | 证据 |
|---|---:|---:|---|
| 功能完整度 /25 | 17 | 21 | OTA 发布快照、契约回归和断点续传补齐；真机能力仍未验收 |
| UI 与用户体验 /20 | 15 | 16 | 模态焦点边界与真实 Edge 9/9 |
| 稳定性 /20 | 15 | 17 | 新增包装器回归；现有检查 0 fail |
| 架构与代码质量 /15 | 12 | 13 | 保持零依赖，未套用不适用的桌面更新框架，发布与运行时边界清晰 |
| 性能与安全 /10 | 7 | 8 | 原子锁、输入范围、停止确认；未做设备渗透测试 |
| 文档与工程交付 /10 | 8 | 10 | CI、Release workflow、AUTO_UPDATE、CHANGELOG、独立 evolution 记录 |
| **合计 /100** | **74** | **85** | 评分不替代真机和外部 Release 验收 |

## 7. 未完成与下一阶段

1. 在受控 RE-CP-02 上验证 LuCI ACL/RPC、OTA 检测/下载/SHA、服务启停、状态面板温度/无线数据。
2. 不要在生产设备上测试 eMMC 破坏性脚本；单独准备可恢复测试机。
3. 查看 Linux CI 的 `check-ota-wrapper.js` 动态双进程结果；若失败，先修复锁生命周期再提交。
4. 在确认 Tftpd64 来源/签名前不要运行该二进制。
5. 若需要数字签名，先建立设备端公钥信任根、发布私钥 GitHub Secret 和失败拒绝测试；当前签名仍是 BLOCKED。
6. 本轮未提交、未推送、未发布；是否提交由维护者后续决定。

结论：在线更新链路已在代码、CI、清单、校验和文档层面接入并通过本地验证；项目状态为“可继续集成验证”，不是“真实 Release、签名或真机刷写批准”。
