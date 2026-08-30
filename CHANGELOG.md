# Changelog

## 1.1.0 - 2026-08-30

- 增加官方 OpenWrt 25.12.5 更新、备份、owut、sysupgrade 与回滚章节。
- 将官方 RE-CP-02 镜像设为阅读站首要升级基线，保留历史和个人构建的独立说明。
- 增加项目健康检查脚本，覆盖站点资源、文档映射、脚本语法和 SHA256 清单策略。
- 整理社区 RE-CP-02 设备实践来源、许可证边界和不同分区布局的混用风险。
- 补充 25.12 `mipsel_24kc` 包架构检查，并强化初次刷写前的官方/第三方分区布局闸门。

## 1.0.0 - 2026-08-13

- 持续更新 JDCloud RE-CP-02 OpenWrt 指南，包含 9 篇核心文档、固件清单、排障路径和网页阅读入口。
- 增强网页阅读体验：文档目录、上一篇/下一篇、代码复制、正文搜索结果摘要、滚动进度和渐显动画。
- 修正准备工作与刷机流程中的推荐固件文件名，统一指向含 TF 卡驱动的 sysupgrade 固件。
- 补充 eMMC 备份前的挂载提示，并把 SCP 示例改成通用电脑账号和 IP 占位符。
- 增加 Xray soft-float 资产校验记录，便于恢复 v2rayA 全局分流配置。
- 增加正式刷机前核对 OpenWrt 官方最新版的安全提醒，避免把仓库实测文件误当作长期最新版。

## 0.1.1 - 2026-07-28

- Added source credits for the original references and firmware notes.
- Moved firmware binaries into `firmware/`.
- Added SHA256 checksums for the bundled firmware files.

## 0.1.0 - 2026-07-28

- Initial public guide.
- Added flashing, first boot, eMMC overlay, common services, v2rayA, and troubleshooting docs.
- Added sanitized Windows network diagnostic script.
- Added LuCI v2rayA shortcut example.
## 2026-08-09

- 增加零依赖的玻璃质感网页阅读入口，根目录访问会进入 `site/`。
- 补齐 9 篇文档卡片，支持全文搜索、弹窗阅读、章节内链、主题持久化和移动端布局。
- 增加真实路由器首屏视觉、滚动进度、渐显动画、键盘焦点样式与 favicon。
- 脱敏全球分流文档中的节点域名、IP、Reality 参数，并清理 Tftpd64 配置中的默认密码和本机租约信息。
- 重新校验仓库内 5 个核心固件与 U-Boot 的 SHA256。
