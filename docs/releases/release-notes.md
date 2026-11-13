# 版本更新记录

这里汇总面向使用者的变化、修复和升级注意事项，作为 README 与 GitHub Release 的说明来源。详细实现记录见 [CHANGELOG](../../CHANGELOG.md)。

版本日期沿用原日志，不等同于提交、标签或 Release 创建时间；固件版本与项目版本独立。无单独版本号的同期改进会明确标注。历史记录中的官方版本、文件数量均指当时状态。

目前存在 GitHub Release 的版本为 v1.4.0、v1.4.1、v1.5.0；v1.0.0 仅有标签，其余条目保留为项目历史版本记录。

## 1.5.0 - 2026-11-13

本地固件文件校验、可恢复搜索与更可靠的服务操作。

### 新增与改进

- 下载后可在浏览器内计算 SHA256，并与仓库清单比对；同名文件自动选中条目，改名文件可手动指定。结果区分完全匹配、摘要匹配但文件名不同和摘要不匹配。文件不上传，单文件最大 64 MiB。
- 搜索优先展示标题命中的文档，显示正文摘要及来源行号，点击后跳到所在章节并聚焦标题；结果数量严格限制在 30 条。
- 文档与搜索提供失败重试，重复打开已加载章节可复用内容，慢请求超时后可以重新尝试。
- 阅读站点与 Glass 主题统一石墨灰、荧光黄和冰青配色；站点增加可固定侧栏、当前位置提示、手机底部导航及跟随系统／浅色／深色主题。

### 问题修复

- 关闭搜索后，在途请求不会写回旧结果；文档加载失败不会覆盖已有阅读位置。
- 插件中心仅在命令成功退出时显示成功，根据实际运行实例判断服务状态；阻止同一服务重复操作，状态刷新失败时明确提示。
- 发布包校验清单使用同目录文件名，下载后便于直接核验；发布前检查通过后才生成资产。

### 升级与兼容

- 本地校验需要 localhost 或 HTTPS 环境；超过 64 MiB 请使用系统 SHA256 工具。匹配不能代替发布者身份、设备型号及镜像用途核对。
- LuCI 插件中心需同时更新菜单与 dashboard4 视图；Glass 主题需同步更新样式和模板以刷新缓存。
- 资产为项目源码包、OTA 清单快照和 SHA256 清单；更新项目不会直接刷写路由器。真实设备服务控制、安装、重启及回滚仍需单独验收。

[发布页面](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/releases/tag/v1.5.0) · [标签差异](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/compare/v1.4.1...v1.5.0)

历史依据：[2027e28](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/2027e2851ffe67718977cec34fdf85eddb9a007a)。

## 1.4.1 - 2026-11-12

补齐项目发布下载与校验流程，修复更新中心和阅读站点的可靠性问题。

### 新增与改进

- GitHub Release 开始提供项目源码包、包含提交号的 OTA 清单快照和 SHA256 校验清单，便于保存和核对同一版本资料。
- 更新下载增加失败重试与断点续传；服务器不支持续传时完整重下，最终仍核对文件大小及摘要。
- 官方 OpenWrt 升级资料的基线更新为 25.12.6，增加从 ImmortalWrt 切换到官方 OpenWrt 的备份、组件依赖和恢复顺序说明。
- 补齐更新中心部署、检查与卸载指引，说明在线更新、人工刷写和签名验证的边界。

### 问题修复

- 更新中心的版本按钮跟随清单生成，避免固定按钮与实际版本不一致，并改善空清单和错误清单处理。
- 修复并发检测覆写输出；下载前拒绝不安全的地址、文件名、摘要和文件大小。
- 文档打开和翻页后保持焦点，Tab 留在当前弹窗；清空搜索后不再写回旧结果。
- 修复行内代码被误解析、表格对齐与部分链接展示；修正 UPnP 安装和升级后连通性检查指引。
- 修复路由器脚本缺少执行权限、Windows 检查误用 WSL Bash、登录页路径特殊字符问题；停止服务前增加确认。

### 升级与兼容

- 这是项目资料与工具更新，固件版本仍由上游更新源独立维护。HTTPS 和 SHA256 不等于固件签名认证。
- 跨 ImmortalWrt／OpenWrt 迁移前需核对分区布局和插件来源；Glass 依赖 Argon，不能假定另一发行版的软件源包含所有原插件。
- 保留原始下载资产。本版本 SHA256 清单条目带 release/ 前缀，手工校验时需按该路径放置文件，或使用校验工具逐项比对；v1.5.0 改为同目录文件名。
- 此版本记录不代表设备上的 ACL、OTA 刷写、eMMC 扩容、温度及无线数据均已验收。

[发布页面](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/releases/tag/v1.4.1) · [标签差异](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/compare/v1.4.0...v1.4.1)

历史依据：[4de4b3c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4de4b3c78e3ce01f32845ae3b4c31a030461a46e) · [bf7f65e](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/bf7f65e673e1ab6e1f405b5d36e6d83da28fa3a3) · [db15197](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/db15197ca48ba820bcac1874ca51c23a1d8c386e)。

## 1.4.0 - 2026-11-08

扩展设备状态展示，把服务操作、更新源切换和阅读进度放到常用入口。

### 新增与改进

- 状态面板增加温度和无线客户端数量；设备未提供温度时显示“--”，无线客户端查询具备备用读取路径。
- 插件中心为已安装服务提供启动、停止和重启操作，完成后刷新状态；操作按钮与设置入口分开，避免误跳转。
- 更新中心支持 GitHub 主源与 Gitee 备用源切换并记住选择，命令行也可指定来源。
- 搜索结果按文档分组展示摘要及数量提示；翻页与关闭都会保存阅读位置，主要仓库入口统一到 GitHub。

### 问题修复

- 状态面板通过只读接口获取温度和无线信息，不再由页面执行外部无线命令。
- 脚本统一 LF 换行，避免从 Windows 上传后在路由器上报行尾错误；增加相应脚本检查。

### 升级与兼容

- 更新 LuCI 组件时需同时更新对应视图、菜单和权限文件，否则可能看到旧页面或遇到权限拒绝。
- 此版本服务命令结果和运行徽标的判断仍有不足，v1.5.0 已修复；有服务控制需求建议使用后续版本。
- 切换下载源不会跳过型号、发行版和完整性校验，也不会自动刷写。该历史 Release 没有单独上传自定义资产。

[发布页面](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/releases/tag/v1.4.0) · [标签差异](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/compare/v1.0.0...v1.4.0)

历史依据：[5ec6826](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/5ec6826fa1821646c46aca4b6bad827b9fe8f293)。

## 1.3.0 - 2026-11-06

增加路由器状态面板、深浅主题，以及具备预览和确认步骤的维护工具。

### 新增与改进

- 新增状态面板，周期刷新物理网口连接、速率、CPU、内存、负载及收发速率，兼顾 DSA 与旧网口命名。
- 插件中心增加安装与运行状态徽标，独立管理页面提供仅限局域网使用的提醒。
- Glass 主题支持跟随系统、浅色和深色模式并记住选择；小屏降低视觉效果开销，尊重系统的减少动态效果偏好。
- 新增 eMMC overlay 扩容和 LAN 网络急救脚本，默认预览，显式执行前还需确认；网络急救可选择恢复地址和 WiFi。

### 问题修复

- 更新任务增加并发锁、残留锁处理、唯一临时文件和剩余空间检查，减少重复请求及下载空间不足的影响。
- 修复主题路径序列化，改善浅色首次加载和部分白底残留；本地 HTTP 服务未启动时可以跳过相关检查。

### 升级与兼容

- eMMC 扩容会重新分区并清空目标设备，网络急救会重启网络并可能断开 SSH；应先备份、核对设备并阅读预览。
- Glass 沿用 Argon 依赖及 ImmortalWrt 25.12 适用范围，不能据此宣称适配所有固件。
- 本版无独立 GitHub Release；日期沿用原日志的 11 月 6 日，相关实现于 11 月 7 日提交。早期服务徽标的判断在 v1.5.0 进一步修正。

历史依据：[b3937bf](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/b3937bfaba0d9bcf36e91922efc508d753300480) · [e34ba67](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e34ba675cc4ac20f977c379de0fa86e4404fa951) · [660aa69](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/660aa6967507a4dec92028c7b711ec85e6ffe36f) · [e3d1d94](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e3d1d944521ee3605c05dbad4f7921b27ed42e0e) · [45de8dd](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/45de8dd7ace0308e862738dcfe703494fb0b2387) · [ae3d2f5](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ae3d2f5b09d4214767d3db2084b2310106cc722c)。

## 1.2.5 - 2026-10-07

修复 Glass 表单显示、PassWall 工具栏和更新中心跳转。

### 问题修复

- 修复系统设置等选项卡表单的大面积白底残留，使主题覆盖范围与页面结构一致。
- 补回 PassWall 节点页添加、删除和全选工具栏，使依赖这些控件的增强测速操作能够显示。
- 更新中心的备份与更新入口改为正确的系统页面，补充 25.12.2 条目的内核信息。

### 升级与兼容

- 更新主题和视图后需刷新缓存；按部署文档同步更新资源版本和菜单路径。
- 补充内核信息不代表发布了新固件，也不改变推荐更新分支。

历史依据：[05b828c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/05b828cd6d7d7ad722ab6a30eda2fabec2f163c3) · [7a097a4](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/7a097a439b2f1883711915356c8ee57f34966e81) · [ac58b2d](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ac58b2d6c5f186836a02635ab424858a1acb05f0) · [eceab80](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/eceab800cc89af4037efb07ffbf9219abcdcbb4f)。

## 1.2.4 - 2026-10-07

修复订阅内容展示风险与更新轮询故障，首次提供插件中心。

### 新增与改进

- 新增插件中心，为已安装功能提供统一入口；独立端口页面在新标签页打开，此时尚无 v1.4.0 才加入的服务启停按钮。
- 更新中心按版本从新到旧展示更新日志，并显示清单日期，方便辨认缓存内容。

### 问题修复

- 对 PassWall 节点备注、地址和分组等内容安全转义，修复订阅内容进入页面时的脚本注入风险。
- 修复测速 NaN、重复地址更新错行、列表加载失败无提示及部分回调异常。
- 补齐更新轮询读取权限，避免检测成功却显示超时；支持升级参数的等号写法。
- 推荐目标恢复为 24.10.6，25.12.2 保持手动选择；修复目录锚点、表格闭合、禁用浏览器存储时的初始化及 Windows 检查异常处理。
- 补充镜像选择、网络地址回退、文件上传、IPv6 查询和后端测速目标透传说明，清理调试残留。

### 升级与兼容

- 早期 PassWall 增强页面用户应更新此安全修复，保留自己的配置和原文件备份。
- 更新中心需同步更新权限文件并刷新相关服务；仅替换页面不能解决读取被拒问题。
- 25.12.2 仍是跨大版本的人工选择，不应把临时测试阶段的推荐设置当作当前建议。

历史依据：[1939ae9](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/1939ae9a66fd538b972ffae3192e303be5f6e91f) · [ec65b0f](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ec65b0f804421b9566b2b78190c4893359d6332a)。

## 1.2.3 - 2026-10-06

增加 ImmortalWrt 25.12.2 手动选择，并记录同期更新中心与主题改进。

### 新增与改进

- 更新源收录 RE-CP-02 的 ImmortalWrt 25.12.2，提供版本说明与摘要，供手动选择新分支。
- 同期补充：在本版记录之后、v1.2.4 之前，固件更新源页面更名为更新中心，集中提供更新入口。
- 同期补充：首次引入依赖 Argon 的 Glass 主题，提供透明卡片、背景及登录页面，并修复部分白底残留和下拉控件裁切。

### 升级与兼容

- 原版本说明保留 24.10.6 为推荐目标；之后曾临时把 25.12.2 设为推荐用于链路测试，v1.2.4 已恢复。历史中间提交不能作为当前升级建议。
- 从 24.10 切换到 25.12 属跨大版本升级，应先备份，评估不保留配置，并重新核对代理等服务。
- 同期主题改进没有独立版本号；当时面向 ImmortalWrt 25.12，不能推定已适配 24.10 或官方 OpenWrt。

历史依据：[e0d44af](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e0d44af76c9889f6cf086958478ce90e64a8d2f3) · [2407602](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/24076028a9d05e6fd8aa9eb7328690c0224ebd8d) · [4c3b172](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4c3b1723c8bc80461d29d9b4e64f3c922ac8ba19) · [c6c89d5](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/c6c89d5ba3a756ace2de91105aa87a878a5c4f9e) · [52a49df](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/52a49df894b86f5008210ae17d4c0e5cae18784e) · [29da690](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/29da69038f5fbbbd7f51c4554830f25603a18c4b) · [4c9054c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4c9054c8c57dbacc715458d8bea05b6ae34413c8)。

## 1.2.2 - 2026-10-06

增加多目标节点测速与筛选，补充更新日志展示和可选主题信息。

### 新增与改进

- PassWall 节点可分别测试百度、谷歌、GitHub 和 Instagram，按四目标中的最低有效延迟排序，最多同时运行 8 个测速任务。
- 超标筛选会标记任一目标达到 1500 ms 的节点；缺失、超时及错误数据保留，删除仍使用原有确认流程。
- 补充后端目标白名单适配步骤，让四目标真正传到测速过程；未知目标回退到全局设置。
- 补录原日志遗漏：更新源页面增加版本更新日志，可选 Argon 补丁显示版本信息，随后补充登录页动态背景。

### 升级与兼容

- 四目标测速需配套适配后端，仅替换前端不够；部署前备份原文件，核对实际 PassWall／PassWall2 版本。
- 排序反映当前网络及固定目标下的测速结果，不代表节点整体质量；补丁不附带节点、订阅或凭证。
- 建议使用后续修复版本：v1.2.4 加固订阅内容展示，v1.2.5 补回可能缺失的原生工具栏。

历史依据：[1ec4dc3](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/1ec4dc30953b74a0b3c76002a80f9e8d8c563441) · [74dc302](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/74dc30297ee19d41698fd61eabb90e3d37e96030) · [5ff7290](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/5ff729030d7334f6205cd06ad8ecc3ffe6808929)。

## 1.2.1 - 2026-10-05

把命令行更新检测和下载带到 LuCI 页面。

### 新增与改进

- 新增“系统 → 固件更新源”页面，提供检测与下载入口，后台执行后持续显示结果，避免长任务一直阻塞页面。

### 问题修复

- 默认更新源修正为 main 分支；调整清单说明文字，应对当时 Gitee raw 内容审查造成的访问问题。

### 升级与兼容

- 页面提供检测和下载，不直接刷写；安装仍需人工确认，更新源可达性取决于网络与托管服务。
- 独立部署需配套脚本、菜单及权限文件；早期轮询读取权限不足的问题于 v1.2.4 修复。

历史依据：[6657ac4](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/6657ac4f55ef207a6ad059fbb6fb36952bde7a9d) · [dd7c5d6](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/dd7c5d60a7cc1e94eec911a74aee701b4f321cdb)。

## 1.2.0 - 2026-10-05

建立设备更新清单，提供检测、下载校验与人工确认刷写流程。

### 新增与改进

- 新增 RE-CP-02 更新源，首批记录 ImmortalWrt 24.10.6 与 23.05.7 的版本、来源、文件大小及摘要。
- 路由器更新工具支持只读检测、下载校验和人工确认刷写，核对型号、发行版与 SHA256。
- 增加刷机后清理工具，预览停用网页终端及处理 DDNS 占位配置等动作，扩充工具箱说明。

### 升级与兼容

- 项目版本 1.2.0 与固件版本互相独立，新增清单不表示已经替用户更新设备。
- 执行清理或刷写前先阅读预览并备份；摘要不等于签名认证，跨大版本配置保留需要人工判断。

历史依据：[0118930](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/011893061e653c670d857003f34824e8151ed266)。

## 1.1.1 - 2026-10-05

清理历史固件与重复资源，让源码下载用户也能进行健康检查。

### 新增与改进

- 将官方 OpenWrt 25.12.5 两类镜像摘要加入清单，当时共 8 项；补充 Xray 核心上游版本核对提示。

### 问题修复

- 移除残留 stock 固件、重复 TFTP 目录、未使用图片及样式，使内容与只保留固件说明和摘要的策略一致。
- 缺少 Git 仓库信息或 Node 时说明跳过对应检查，避免把 ZIP 下载用户直接判定为检查失败。

### 升级与兼容

- 使用资料仍需自行获取可信固件，不能因为源码包里没有镜像就换用其他型号文件。
- 本版无独立标签；与 v1.2.0 的记录及改动由同一提交保存，此处保留原日志的版本划分。

历史依据：[0118930](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/011893061e653c670d857003f34824e8151ed266)。

## 1.1.0 - 2026-08-30

补齐官方固件升级、备份与回滚主线。

### 新增与改进

- 增加官方 OpenWrt 25.12.5 的更新、备份、owut、sysupgrade 及回滚说明。
- 阅读站点以官方 RE-CP-02 镜像为主要升级参考，历史镜像和个人构建单独说明。
- 增加项目健康检查，覆盖资源、文档、脚本与校验清单；整理设备实践来源和许可证边界。

### 升级与兼容

- 刷写前区分官方与第三方 U-Boot／分区布局，不能只凭处理器平台判断固件是否通用。
- 安装软件前核对 25.12 的 mipsel_24kc 包架构；25.12.5 是当时基线，不代表当前最新版。

历史依据：[3869917](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/3869917df2b7579deea099e89ca0fca4fa28bde9)。

## 1.0.0 - 2026-08-13

形成覆盖准备、刷机、配置与恢复的首个 1.x 指南版本。

### 新增与改进

- 整理 9 篇核心文档、固件清单和排障路径，通过网页入口阅读。
- 阅读器增加目录、上一篇／下一篇、代码复制和带摘要的正文搜索，以及滚动进度和渐显效果。
- 增加 Xray soft-float 文件校验记录，方便恢复分流配置时核对核心文件。

### 问题修复

- 统一准备与刷机章节推荐的含 TF 卡驱动 sysupgrade 文件名；补充 eMMC 备份前挂载提示，SCP 示例改用通用账号和地址。

### 升级与兼容

- 历史镜像用于说明当时实测流程，正式刷写前仍要核对官方版本、型号和文件用途。
- 本版本有 Git 标签，目前没有对应 GitHub Release 页面；日期沿用原日志 2026-08-13。

历史依据：[dc8c167](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/dc8c167963f1e3f35b45460fedb56ace7540290a)。

## 0.2.0 - 2026-08-09

增加无需构建的网页阅读入口，完善资料脱敏。

### 新增与改进

- 根目录进入静态阅读站点，提供 9 篇文档卡片、正文搜索、弹窗阅读、章节链接和移动端布局。
- 主题选择可以保留，增加路由器首屏图片、滚动进度、渐显效果、键盘焦点样式及图标。

### 问题修复

- 脱敏全球分流文档中的节点域名、IP 及连接参数，清理 TFTP 配置默认密码、本机地址及租约信息。
- 重新核对当时记录的 5 个核心固件与 U-Boot 文件摘要。

### 升级与兼容

- 通过本地 HTTP 服务加载文档，直接打开 HTML 可能无法读取章节。
- 恢复配置时需使用自己的数据；历史文件清单不保证长期仍可下载。

历史依据：[d4c92d9](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/d4c92d993a2cb9176034fa6efaf526f45eae3740)。

## 0.1.1 - 2026-07-28

整理来源署名、固件目录和摘要核对依据。

### 新增与改进

- 补充原始教程、设备实践与固件资料的来源及致谢。
- 将当时随仓库提供的固件集中到 firmware 目录，补充文件用途说明和 SHA256 清单。

### 升级与兼容

- 这是早期布局记录：当时包含固件二进制，后续已改为主要保留说明和摘要，不能把此条当作当前下载方式。
- 使用历史文件前仍应核对来源、RE-CP-02 型号及摘要。

历史依据：[cf4f9b1](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/cf4f9b130140bfe5fafb67f9f6e8ae8fa9b0703f)。

## 0.1.0 - 2026-07-28

首次公开 RE-CP-02 刷机与家庭网关配置指南。

### 新增与改进

- 提供准备、刷机、首次启动、eMMC overlay、常用服务、v2rayA 和故障排查文档。
- 提供脱敏的 Windows 网络诊断脚本，以及从 LuCI 打开 v2rayA 管理页的示例。

### 升级与兼容

- 本版以手工指南与辅助脚本为主，不会自动获取设备权限或刷机；擦写和分区步骤需自行确认并备份。
- 私人配置使用占位符，实际使用时应填写自己的网络信息。

历史依据：[839144b](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/839144bbd97d8b25ec34a7926c16639a91efb586)。
