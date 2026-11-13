# RE-CP-02 项目升级报告

日期：2026-11-13。起点：本地 `main`，HEAD `db15197`。本报告记录升级实施结束、发布开始之前的验收快照；当时尚未提交、推送、发布或连接路由器。随后用户授权发布 v1.5.0，版本信息见 [发布说明](docs/releases/release-notes.md)。

## 范围与完成清单

- [x] 识别项目、入口、数据和部署边界，检查初始 Git 状态。
- [x] 检查阅读器、搜索、校验清单、LuCI 服务操作、OTA 及辅助脚本的关键路径。
- [x] 联网研究 5 个相关开源项目的源码、结构、维护信息和许可证。
- [x] 制定 P0–P3 清单，实施适合本仓库的可靠性与核心体验改进。
- [x] 保留现有视觉设计，完成校验表单、错误恢复和搜索定位交互。
- [x] 运行逻辑回归、浏览器回归、健康检查与既有回归。
- [x] 同步 README、更新日志、部署说明、来源和实际截图。
- [ ] 路由器实机、BusyBox/rpcd 行为、升级安装回滚与远程 CI 验收：本轮没有相应环境证据。

开始时已有 7 个文件未提交：`site/app.js`、`site/index.html`、`site/styles.css`，以及 Glass 主题的 README、header.ut、header_login.ut、glass.css。前三个在原修改上增量扩展；四个主题文件未改。先前已有的侧栏、主题三态和移动导航不计作本轮新增成果。

## 项目认知与功能地图

该项目是面向京东云无线宝 RE-CP-02 的刷机、恢复及家庭网关指南，加上一组可选的 LuCI 扩展。它不是通用刷机软件。

| 模块 | 实际实现及入口 | 数据与环境 |
| --- | --- | --- |
| 阅读站点 | 根 index.html 跳转 site/；原生 HTML/CSS/JS，无打包步骤 | HTTP 读取 11 篇 docs Markdown；localStorage 保存主题及阅读位置 |
| Markdown 渲染 | site/markdown.js，支持目录、代码复制、表格及受限链接 | 内容经转义；没有富文本编辑器或用户文档数据库 |
| 固件资料 | firmware/README.md 与 SHA256SUMS.txt | 8 个摘要条目，仓库不含固件二进制 |
| OTA | scripts/ota-check.sh、ota/manifest.json、LuCI update-center5 | 自有源，版本/设备/发行版检查、HTTPS、下载摘要、运行锁、人工刷写确认 |
| 插件中心 | LuCI menu.d、dashboard3 → dashboard4 | rpcd 获取服务列表，fs.exec 调用 init 脚本；ACL 控制权限 |
| 状态面板 | panel2.js | 5 秒轮询网口、CPU、内存、温度与无线客户端，依赖真实设备 |
| Glass 主题 | ucode 模板、CSS | 路由器部署，依赖 Argon；本轮保留原改动 |
| 辅助工具 | eMMC 扩容、LAN 急救、清理、网络诊断、PassWall 补丁 | 部分操作会修改设备，默认预览/确认机制；未在宿主机运行设备修改命令 |
| 检查与发布 | scripts/check-*.js、PowerShell 健康检查、GitHub workflows | 本地 Node/Python/Git Bash；远程发布不在本轮执行范围 |

安装和运行：静态站点无需安装 npm 包，在仓库根目录执行 `python -m http.server 18765 --bind 127.0.0.1`。没有独立业务后端、数据库迁移或 Web API；LuCI RPC 由路由器提供。未引入框架、依赖、数据库或基础设施。

## 发现与优先级

| 优先级 | 问题/机会 | 价值、实施成本与风险 | 处置 |
| --- | --- | --- | --- |
| P0 | 服务退出非零仍显示执行成功，procd 记录存在就标为运行中 | 避免错误运维判断；小幅视图改动；需实机补验 | 修复，加入退出码和 running 实例检查 |
| P1 | 失败搜索被永久缓存为空、关闭后旧响应回写 | 搜索可恢复；低风险；请求缓存模块独立 | 修复，失败不缓存、代次隔离、重试入口 |
| P1 | 搜索点击只打开文档，无法定位命中内容 | 减少查找步骤；复用现有 h2 锚点 | 实现章节跳转与聚焦，显示来源行号 |
| P1 | 网页只有复制哈希，没有实际文件比对 | 减少手工抄写错误；WebCrypto 无新依赖；限制内存输入 | 实现 64 MiB 内本地文件校验 |
| P1 | CI 映射正则漏掉 AUTO_UPDATE.md | 已有文件即可触发假失败；低风险 | 用实际 docs 元组与目录集合比较，覆盖大写文件名 |
| P1 | 加载/失败页可能覆盖先前阅读位置 | 保护已有本地状态；兼容旧存储键 | 仅保存成功加载的文档位置；关闭使旧请求失效 |
| P2 | 重复拉取章节、加载缺少超时、临时目录被当源码扫描 | 请求去重与检查提速；不增加持久缓存 | 共享会话缓存、12 秒超时、源码目录白名单 |
| P2 | 服务按钮可重复触发，刷新异常缺少反馈 | 避免同服务并发请求；局部状态门禁 | 新视图处理，回归覆盖 |
| P3 | 离线文档包、全文模糊检索、自定义固件构建 | 可能有价值，但增加缓存失效、依赖或外部服务维护 | 暂不引入；当前文档量下没有必要新增搜索引擎 |

## 开源研究与采用范围

通过 GitHub API 检查仓库结构、默认分支、最近推送时间和归档标记，并阅读下列源文件。查询时五个仓库均未归档；最近推送均在 2026 年 11 月。维护信息是调研时快照，不构成未来维护承诺。未运行竞品服务，UI 结论来自源码与文档，不宣称完成竞品实机体验。

| 项目与许可证 | 实际读取的证据 | 有价值的实践 | 本轮应用 |
| --- | --- | --- | --- |
| [OpenWrt Firmware Selector](https://github.com/openwrt/firmware-selector-openwrt-org)，CC0-1.0 | README、LICENSE、[images.js](https://github.com/openwrt/firmware-selector-openwrt-org/blob/main/www/js/images.js) 的镜像类型帮助与 hash 展示 | 同屏呈现文件用途和校验信息，保持原生静态站点 | 同一固件区增加实际文件比对，保留用途/设备核对提示 |
| [OpenWrt ASU](https://github.com/openwrt/asu)，GPL-2.0 | README、LICENSE、[build_request.py](https://github.com/openwrt/asu/blob/main/asu/build_request.py) 的输入模式与大小边界 | 输入在边界验证，构建服务隔离且有资源约束 | 清单严格解析，文件大小在读取前拒绝；未移植构建服务 |
| [owut](https://github.com/efahl/owut)，GPL-2.0-only | README 的 License、[files/owut](https://github.com/efahl/owut/blob/main/files/owut) 的 sha256 与 sysupgrade 分段 | 验证与安装分开，明确反馈中间状态 | 校验工具独立于任何刷写行为，匹配结果不表述为“可以安全刷写” |
| [Docsify](https://github.com/docsifyjs/docsify)，MIT | 目录、LICENSE、[search.js](https://github.com/docsifyjs/docsify/blob/develop/src/plugins/search/search.js) 的索引存储和路径组织 | 索引记录与文档路径关联，避免重复加载 | 共用章节读取缓存，搜索项关联路径与章节；未引入 Dexie/IndexedDB |
| [VitePress](https://github.com/vuejs/vitepress)，MIT | 目录、LICENSE、[local-search.ts](https://github.com/vuejs/vitepress/blob/main/src/client/theme-default/support/local-search.ts) | 标题、上级标题、正文分字段，标题加权 | 原生搜索优先呈现标题命中文档，保留严格结果上限；未引入 MiniSearch |

额外核对 [LuCI fs.js](https://github.com/openwrt/luci/blob/master/modules/luci-base/htdocs/luci-static/resources/fs.js) 中 FileExecResult 的 code/stdout/stderr 契约，据此修复服务成功判定。

本仓库声明 MIT。本轮新增实现独立编写，没有复制任何竞品代码；GPL 项目仅参考行为思路，未混入 MIT 发布源码。许可证核查包括四个项目的 LICENSE 和 owut README/SPDX 声明。

| 对比维度 | 本轮之前 | 参考实践 | 升级后的真实情况 |
| --- | --- | --- | --- |
| 核心功能 | 哈希仅展示/复制 | 固件与校验流程紧邻 | 真实文件 SHA256 计算与清单比对 |
| UI | 已有侧栏、三态主题、移动导航 | 文件用途、风险、动作同屏 | 校验表单沿用现有配色、字体与断点 |
| 体验 | 搜索没有精确章节定位 | 结果关联标题和路径 | 命中行展示、章节滚动与键盘聚焦 |
| 架构 | 数据读取与 UI 混在 app.js | 搜索索引与存储边界分离 | guide-tools 纯逻辑模块，Node 可直接验证 |
| 自动化 | CI 目录映射有误，遗漏 Markdown 回归 | 可重复回归检查 | 明确 Node 24，补入三组逻辑检查和资源冒烟 |
| 扩展 | 页面内重复请求逻辑 | 共用数据契约 | 请求去重、可重试加载器和解析接口可复用；没有虚构插件系统 |

## 具体改动与兼容性

- `site/guide-tools.js`：摘要清单解析、WebCrypto 摘要、结果分类、可重试读取缓存、标题/正文索引和结果上限。成功缓存仅存在当前页面，不保存固件内容。
- `site/firmware-check.js`：文件/条目选择、加载态、错误重试、计算态及过期结果丢弃。没有上传 API、刷写按钮或模拟生产固件。
- `site/app.js`：复用加载器；错误可重试；命中章节定位；读到正文后才写进度；修复关闭请求与 Shift+Tab 边界。旧主题与进度存储键保持兼容。
- `site/index.html`、`site/styles.css`：新增双栏校验区域，小屏切单栏，长摘要换行，状态播报和可见焦点；使用现有色彩及 Bahnschrift/Segoe UI 字体。
- `luci-app-plugin-hub/.../dashboard4.js`、menu.d、README：部署新视图、退出码判定、真实运行实例、并发门禁与刷新失败提示；旧 dashboard3.js 未删除。
- `scripts/check-guide-tools.js`、`scripts/check-plugin-hub.js`：独立数据与 LuCI 逻辑回归，LuCI 采用 stub，不能代替设备验收。
- `scripts/check-site-interaction.js`：扩展真实 headless 浏览器检查，隔离测试目录在本仓库 outputs 下，生成四种视口/主题截图，统计未处理异常。
- `.github/workflows/checks.yml`：修复文档集合检查、固定 Node 主版本、增加回归和 HTTP 资源检查。
- `scripts/project-health-check.ps1`：补齐 HTTP 脚本资源，限制源码扫描目录。
- `README.md`、`CHANGELOG.md`、`CREDITS.md`、`.gitignore`、本报告与 docs/images：说明、来源、未发布变更和截图。

没有删除文件，没有修改设备配置、用户数据或数据库。旧视图保留是为现有部署提供回退材料，新的 menu.d 只引用 dashboard4。

## 验证证据

环境：Windows、Node 24.20.0、Python 3.8.6、headless Edge、本地 HTTP 站点。没有安装新依赖。浏览器插件因安装路径缺少 browser-service.mjs 无法启动，使用仓库既有浏览器测试机制完成验证。

| 命令/检查 | 结果 | 解释 |
| --- | --- | --- |
| node scripts/check-guide-tools.js | PASS：9 个测试 | 真正的 WebCrypto 对比 Node 摘要；非法清单、大小边界、缓存去重、超时取消、失败重试、锚点、上限和文档映射 |
| node scripts/check-plugin-hub.js | PASS：4 个测试 | 非零/缺失退出码、并发、RPC/刷新错误和 running 状态；是逻辑 fixture |
| node scripts/check-site-interaction.js http://127.0.0.1:18765/site/ | PASS：19 项 | 原阅读器焦点与搜索检查，加重试、定位、关闭竞态、实际 File 输入、错误摘要拒绝和四种屏幕/主题；无未处理脚本异常 |
| node scripts/check-site-markdown.js | PASS：57 项 | 所有 11 篇文档可渲染 |
| node scripts/check-consistency.js | PASS：15 项 | 仓库当前官方基线 25.12.6 跨文件一致；不是新一轮上游最新版核实 |
| node scripts/check-ota-view.js | PASS：17 项 | LuCI 更新视图的生成逻辑 |
| node scripts/check-auto-update.js | PASS：12 项 | 更新契约与失败 fixture；不是完整设备更新 |
| node scripts/check-ota-wrapper.js | PARTIAL：10 项静态 PASS | Windows 缺少 /proc，动态并发回归跳过 |
| node scripts/check-passwall-node-list-enhance.js | PASS | 既有筛选、排序、并发与转义检查全部通过 |
| powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project-health-check.ps1 -BaseUri http://127.0.0.1:18765/ -RequireHttp | PASS：69 项；8 项跳过 | HTTP、JS/PowerShell/Bash 语法、Git 可执行位、清单与一致性；8 个本地固件不存在属仓库策略 |
| git diff --check | PASS | 无新增空白错误 |
| 前端构建、数据库迁移 | NOT APPLICABLE | 零构建静态站点，没有数据库 |
| 路由器部署、真实服务控制、固件安装/重启/回滚 | BLOCKED | 未提供相连测试设备，没有执行这些操作 |
| 远程 CI、Release、生产部署 | 未执行 | 请求限制远程写入；没有推送或发布 |

浏览器校验使用明确的测试文件 `abc`，与生产清单比对后正确拒绝；匹配/改名分支由 WebCrypto 逻辑测试覆盖。未假称实际固件已验证。桌面 1440×1000、手机 390×844、平板 820×1180 均无页面横向溢出；深色模式另行截图。

健康检查首次发现既有 tmp 浏览器目录被纳入源码扫描，范围修正后结果收敛为 69 项。截图保存于 docs/images；测试日志和临时输出位于忽略提交的 outputs。

## 后续优先级与限制

1. P1：在真实 RE-CP-02 上验收新 menu.d、RPC ACL、服务返回码和异常状态。默认部署文件已准备，未自动部署到用户设备。
2. P1：OTA 发布源的签名认证与密钥管理需要单独方案。当前摘要校验不是发布者认证；本轮没有创建密钥或改动更新信任根。
3. P1：使用专用测试设备验收升级、备份、安装、重启和回滚闭环，并研究在人工确认前单独运行镜像兼容检查。不能用本地 fixture 替代此证据。
4. P2：用真实大文件和低内存手机测量峰值内存及耗时，按证据决定是否升级为分块 Worker 摘要；当前 WebCrypto 一次读入，严格限制 64 MiB。
5. P2：现有 Markdown 渲染仅支持有限语法，文内任意锚点和章节间相对链接仍可继续完善；本轮只增加搜索对应的 h2 定位。
6. P3：若文档规模扩大，再评估离线包、全文模糊搜索或构建时索引。暂不引入重型构建服务、AI 接口或无实际用途的插件架构。

## 完成度：按证据分级

采用 5 分证据尺度：1=设计/部分代码，2=可运行实现，3=本地自动验证，4=真实设备/目标环境验收，5=持续部署/运行证据。此评分描述验证成熟度，不是主观产品排名。

| 维度 | 分数 | 依据与未满足条件 |
| --- | --- | --- |
| 功能完整度 | 3/5 | 本轮校验、搜索和错误恢复已实现且通过本地回归；设备流程未验收 |
| UI/UX | 3/5 | 三种屏幕尺寸、主题、焦点和交互已检查；尚无实机用户可用性测试 |
| 代码质量 | 3/5 | 纯逻辑拆分、失败路径测试、全项目语法检查通过；不是形式化审计 |
| 性能 | 2/5 | 有请求合并与文件上限；未开展低端设备性能基准 |
| 安全性 | 2/5 | 本地处理、输入边界、转义和校验；发布源仍缺少独立签名认证证据 |
| 稳定性 | 3/5 | 异步竞态、网络失败和 RPC 失败有回归；缺少长时间设备运行证据 |
| 可维护性 | 3/5 | 模块可测、CI 契约修复、文档与部署路径同步 |
| 扩展性 | 2/5 | 数据逻辑可复用；刻意保留小型静态架构，未实现通用扩展系统 |

本轮可独立验证的升级已交付；硬件、签名及发布验收仍按上面的边界保留。
