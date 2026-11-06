## 1.3.0 - 2026-11-06

- 新增 `luci-app-status-panel`（状态 → 状态面板）：iStoreOS 风格硬件监控页——物理网口状态图（wan/lan1..4 自动发现，回退 eth0/eth1，绿光=已连接带协商速率，5 秒轮询）、CPU 占用（/proc/stat 差分）、内存进度条、负载与全部物理口合计收发速率；只读，ubus/file 调用全部在 ACL 白名单内（`admin/status/status-panel`，order 5）。
- 插件中心升级（`dashboard.js` → `dashboard2.js`，按发布约定改名并同步 menu.d）：卡片新增服务状态徽标——「运行中」（procd service list 存在）/「已停止」（有 init 脚本未运行）/「未安装」（连 init 脚本都没有，卡片置灰）；独立端口卡片加「仅限局域网」黄色徽标并在页首常驻安全提醒（ttyd/文件管理器/Transmission 勿映射 WAN）；探测失败自动降级不影响跳转；新增 `acl.d/luci-app-plugin-hub.json`。
- Glass 主题深浅双模式：顶栏右上角 ◐ 切换按钮在「跟随系统 → 浅色 → 深色」间循环并持久化 localStorage；浅色为「晨曦微光」面板（浅白磨砂玻璃 + 同套渐变主色），覆盖表单/表格/弹窗/登录页/第三方应用白底残留；模式决策脚本前置到 `<head>`（head_meta.ut）防闪色，theme-color meta 同步切换；glass.css 版本参数 `?v=2` → `?v=3`。
- Glass 主题节能：小屏（≤768px）自动降低光斑模糊与磨砂强度省 GPU；`prefers-reduced-motion` 用户停用光斑动画与过渡。
- 安全修复：`ota-check-ui` 加并发锁（`/tmp/ota-check-ui.lock` + `/proc/<pid>/cmdline` 复核）——重复点击/多标签页不再同时写同一输出文件；已运行时返回 `OTA_BUSY`，页面直接转入轮询复用正在运行任务的实时进度（更新中心 `update-center2.js` → `update-center3.js` 按约定改名）。
- 安全修复：`ota-check.sh` ① 运行锁（`$OTA_TMP/ota-check.lock`，EXIT/INT/TERM 自动清理，残留锁自动接管）防止并发互相覆写 manifest 与镜像；② node/python3 解析器临时脚本改 `mktemp` 唯一文件名，消除固定路径符号链接劫持面；③ `--download/--flash` 前检查 `/tmp` 剩余空间（镜像约 10MB 写满内存盘会挤爆运行内存）。
- 新增 `scripts/emmc-one-key-setup.sh`：一键 eMMC 扩容 overlay，封装 docs/04 手工流程（备份 → 重建分区 → mkfs.ext4 -F → 迁移 → fstab），默认干跑 + `--apply` + YES 二次确认，拒绝 `/dev/mtd*`，分区后自动校验，重复迁移检测。
- 新增 `scripts/router-lan-rescue.sh`：网络急救——LAN 一键恢复静态 192.168.8.1/24（`--ip` 可改）、重开 LAN DHCP、可选 `--wifi` 打开全部 radio，默认干跑 + `--apply` + YES 确认，IPv4 参数校验（含注入拒绝）。
- 健康检查 `project-health-check.ps1`：HTTP 服务未启动时默认 SKIP 并给出启动命令提示（只做本地静态/语法/校验和检查），`-RequireHttp` 恢复强制校验——本地离线跑检查不再整体 FAIL。
- Glass 主题模板修复：footer.ut 的 `luciLocation` 改用 `json()` 序列化输出，消除未转义 ucode 插值。
- 文档同步：README 工具箱扩为八个（补 eMMC 扩容与网络急救两节）、目录树补录 `luci-app-status-panel` 与两个新脚本；luci-app-plugin-hub、luci-theme-glass README 对应更新；新增 luci-app-status-panel README。

## 1.2.5 - 2026-10-07

- Glass 主题修复：系统设置等带选项卡的表单页整卡发白（ImmortalWrt 25.12 的 form.js 选项卡面板不带 `cbi-tabcontainer` 类，argon 以 `[data-tab-title]` 刷白底，半透明玻璃卡叠白底全卡洗白）；面板与 argon 其余白底卡片容器（网络/无线/opkg/防火墙/错误框）统一归零露出深色底，已用真实 cascade.css + form.js DOM 本地复现验证。
- passwall-node-list-enhance：补回整文件替换时丢失的原生工具栏（添加 / 删除选择的节点 / 全选）——原生删除按钮同时是增强按钮的注入锚点，缺失会导致"四目标测速并排序"等按钮永不出现；回归测试补 2 条对应断言（实机已核对上游模板 1248-1249 行的按钮形态）。
- 更新中心：「备份与更新」链接修正为 `admin/system/flash`（实机 luci-mod-system 菜单无 `admin/system/backup`，原为死链）。
- manifest：25.12.2 条目补 `kernel: 6.12`（实机 `uname -r` = 6.12.103）。
- 核对结论：插件中心「流量统计」指向 `admin/services/nlbw` 与实机 nlbwmon 菜单一致，无需修改。

## 1.2.4 - 2026-10-07

- 安全修复：PassWall 节点列表补丁（node_list.htm）对订阅侧备注/地址/分组名/协议等远程数据统一 HTML 与 JS 字符串转义，消除存储型 XSS；同步修复手动测速 NaN 卡格、重复地址索引双写、斑马纹 class 未落到表格行、当前节点回调缺 null 守卫、列表加载失败无占位提示与缓存清理跳键；回归测试新增 7 条转义断言。
- ota-check 修复：rpcd ACL 的 `ubus.file` 白名单补上 `read`，修复独立部署时页面轮询全部被拒、检测成功却显示"后台任务超时"；新增 `--sysupgrade-args="-n"` 等号形式解析（此前按文档示例调用必报未知参数退出）。
- 更新中心页：更新日志按版本号新→旧排序（此前按 manifest 收录顺序原样渲染，24.10.6 排在 25.12.2 前）；日志标题展示清单 `generated` 日期——路由器读的是上次检测时缓存的 `/tmp/ota-manifest.json`，数据过期一眼可见。
- 更新源一致性：`ota/manifest.json` 的 `latest` 修正回 24.10.6，25.12.2 恢复为仅手动 `--version` 检测，与 README/CHANGELOG 的"不参与自动检测提示"承诺对齐。
- site 修复：`###` 标题不再复用 `##` 的目录锚点（修复 docs/09 目录跳转错位与重复 id）；Markdown 表格在空行/标题/列表/引用处正确闭合；localStorage 被禁用时站点初始化不再整体中断。
- project-health-check.ps1 在 Windows PowerShell 5.1 下 `node --check` 与 `git` 的 stderr 不再终止整个检查，语法失败会正确计入 FAIL 并输出 SUMMARY。
- 文档同步：README 目录树补录三个自制 LuCI 组件、诊断脚本参数表补 `-RemoveStaticIPs`；docs/02 为主线（第三方 U-Boot）设备补上应刷镜像文件名；docs/08 Xray 核心表述改为按校验值自行获取；docs/01 静态地址回退补 `Remove-NetIPAddress`；docs/05 get-wan6-ip 补上传路由器步骤；docs/09 scp 示例修正 `./` 路径；get-wan6-ip.sh 排障提示改为 `ubus list` 查接口。
- backend-patch.md 补全 test.sh 分发行三参透传的改后代码与漏改后果、验证方法。
- 仓库清理：删除根目录调试残留 `tmp_luci.json`/`tmp_pk.json`，`.gitignore` 收敛 `*node*` 规则并补 `tmp_*.json` 与 `.zcode/`。

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

## 0.2.0 - 2026-08-09

- 增加零依赖的玻璃质感网页阅读入口，根目录访问会进入 `site/`。
- 补齐 9 篇文档卡片，支持全文搜索、弹窗阅读、章节内链、主题持久化和移动端布局。
- 增加真实路由器首屏视觉、滚动进度、渐显动画、键盘焦点样式与 favicon。
- 脱敏全球分流文档中的节点域名、IP、Reality 参数，并清理 Tftpd64 配置中的默认密码和本机租约信息。
- 重新校验仓库内 5 个核心固件与 U-Boot 的 SHA256。

## 0.1.1 - 2026-07-28

- Added source credits for the original references and firmware notes.
- Moved firmware binaries into `firmware/`.
- Added SHA256 checksums for the bundled firmware files.

## 0.1.0 - 2026-07-28

- Initial public guide.
- Added flashing, first boot, eMMC overlay, common services, v2rayA, and troubleshooting docs.
- Added sanitized Windows network diagnostic script.
- Added LuCI v2rayA shortcut example.
