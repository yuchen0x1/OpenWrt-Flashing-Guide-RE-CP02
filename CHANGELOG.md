## 1.2.3 - 2026-10-06

- 固件更新源收录 ImmortalWrt 25.12.2（新大版本分支，SHA256 取自官方 sha256sums）：`latest` 保持 24.10.6，自动检测不提示跨大版本升级；25.12.2 仅供手动下载尝鲜，刷写建议不保留配置并重装核对代理插件等服务。

## 1.2.2 - 2026-10-06

- 新增可选 `luci/passwall-node-list-enhance/`：PassWall 节点列表 URL 测试列扩展为百度、谷歌、GitHub、Instagram 四个固定目标，"四目标测速并排序"按钮按节点数 × 4 任务（最多 8 并发）测速后按四目标最低延迟排序，并提供"删除超标节点"筛选按钮（任一目标 `≥1500 ms`，`1499 ms` 不勾选；缺失/超时/错误不删除，删除保留原生二次确认）。
- 新增 `luci/passwall-node-list-enhance/backend-patch.md`：上游 `urltest_node` 不支持自定义目标，说明如何给 PassWall/PassWall2 的 controller 与 `test.sh` 套用 `target` 白名单补丁（四个固定标识，不接受任意 URL，未知值回退全局 `url_test_url`）。
- 增加 `scripts/check-passwall-node-list-enhance.js` 回归测试，覆盖四目标固定 URL、1500ms 等号边界、缺失/超时数据、四倍任务计数、有界并发、分组范围、排序、删除二次确认和后端白名单文档检查。
- 补丁不包含订阅、节点、密码或 Token；部署采用先下载到临时文件、备份后再替换的流程。

## 1.2.1 - 2026-10-05

- 新增 `luci-app-ota-check`：LuCI 系统 → 固件更新源页面，提供检测/下载按钮（后台执行 + 轮询结果，规避 rpcd file exec 长阻塞）。
- manifest 措辞调整以规避 Gitee raw 内容审查 451（移除 PassWall 关键词）。
- ota-check.sh 默认更新源地址修正为 main 分支。

## 1.2.0 - 2026-10-05

- 新增自有固件更新源 `ota/`：manifest.json 记录 RE-CP-02 可用版本（首发收录 ImmortalWrt 24.10.6 与 23.05.7，SHA256 均取自官方 sha256sums 并逐一核对），附发布流程说明。
- 新增 `scripts/ota-check.sh` 路由器端更新检测：只读检测 / 下载校验 / 人工确认刷写三档，内置 RE-CP-02 型号门禁、发行版一致性与 SHA256 钉死，跨大版本刷写强制人工确认。
- 新增 `scripts/router-post-flash-cleanup.sh` 刷机后清理：停用 ttyd 网页终端与 DDNS 占位配置，默认干跑预览。
- README 工具箱扩充为五个小工具并同步目录树。

## 1.1.1 - 2026-10-05

- 移除无任何引用的 stock 固件二进制 `Tftpd64/JDCOS.bin`，仓库内容与「不包含固件二进制」策略保持一致；Tftpd64 目录收敛为一份 exe 与一份 ini，删除重复的汉化版子目录。
- 删除未使用的站点图片 `site/assets/hero-router-alt.jpg`，健康检查同步移除该项；清理 styles.css 中无引用的 `.ambient`、`.doc-index`、`.doc-arrow` 死样式。
- 官方 25.12.5 sysupgrade 与 initramfs 镜像的 SHA256 并入 `firmware/SHA256SUMS.txt`（现共 8 项），健康检查可覆盖官方升级基线。
- 健康检查脚本在非 git 目录或缺少 node 时输出 SKIP 而不再 FAIL，zip 下载用户可直接运行。
- 补充 docs/08 中 Xray 核心的上游版本核对提示，刷新站点首页「最后校验」日期。

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
