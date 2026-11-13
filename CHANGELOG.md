# 更新日志

本文保留各版实现与修复细节。面向使用者的说明统一维护在 [完整版本记录](docs/releases/release-notes.md)，README 仅展示最新版本。

本次整理保留全部 16 个版本及原日期；无独立标签的版本以原日志和提交为依据。历史补录注明来源，未创建新版本或重打包已有资产。

## 1.5.0 - 2026-11-13

**版本重点：** 本地固件文件校验、可恢复搜索与更可靠的服务操作。

### 详细变更

- 阅读站点增加本地 SHA256 文件校验，读取现有 8 项清单；包含大小限制、改名提示、错误状态与清单重试，不上传文件。
- 搜索增加标题优先和命中章节定位；共享读取缓存、12 秒超时和失败重试，修复关闭搜索后的旧结果回写以及加载失败覆盖阅读位置。
- 插件中心菜单切换至 `dashboard4.js`：检查服务命令退出码、读取实例 running 状态、防重复操作并处理刷新失败。保留旧视图文件供既有部署回退。
- 修复 CI 文档映射遗漏 AUTO_UPDATE.md，加入工具、插件中心与 Markdown 回归；明确使用 Node.js 24。
- 健康检查只扫描项目源码目录，避免检查临时浏览器扩展文件；HTTP 资源清单补齐站点脚本。
- 新增独立逻辑测试与浏览器交互检查，补充桌面、平板、移动端和深色模式截图。本地检查、main CI 与标签发布流程已通过；已下载发布资产核对哈希及提交，路由器实机尚未验收。
- 阅读站点与 Glass 主题采用统一的石墨灰、荧光黄与冰青配色，补充侧栏、移动导航与三态主题切换。
- 发布补充：完整检查通过后才构建资产；按标签检出并核对提交，Release 正文从版本历史提取，SHA256 清单改为同目录文件名。

### 升级提示

- 本地校验需要 localhost 或 HTTPS 环境；超过 64 MiB 请使用系统 SHA256 工具。匹配不能代替发布者身份、设备型号及镜像用途核对。
- LuCI 插件中心需同时更新菜单与 dashboard4 视图；Glass 主题需同步更新样式和模板以刷新缓存。
- 资产为项目源码包、OTA 清单快照和 SHA256 清单；更新项目不会直接刷写路由器。真实设备服务控制、安装、重启及回滚仍需单独验收。

历史依据：[2027e28](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/2027e2851ffe67718977cec34fdf85eddb9a007a)。

## 1.4.1 - 2026-11-12

**版本重点：** 补齐项目发布下载与校验流程，修复更新中心和阅读站点的可靠性问题。

### 详细变更

- 接入可验证的在线更新发布链路：新增 `release.yml` 标签构建、OTA 清单审计快照、源代码快照与 `SHA256SUMS.txt`；增加 `check-auto-update.js` 覆盖版本比较、失败重试、错误地址和损坏文件场景。
- 新增 `docs/AUTO_UPDATE.md`，明确 OpenWrt OTA 的真实边界、GitHub Release 发布步骤、SHA-256 校验、签名阻塞项和设备端人工刷写要求；README 与站点文档索引同步更新。
- `ota-check.sh` 下载失败重试时支持 curl/wget 的 HTTP Range 断点续传，服务器不支持 Range 时自动回退全量下载，最终仍以文件大小和 SHA256 为硬门禁。
- Markdown 全量回归的文档计数改为动态读取 `docs/`，新增自动更新文档后不会留下“10 篇”硬编码提示。
- 修复 `luci-app-ota-check/root/usr/bin/ota-check-ui` 的并发竞态：改用原子 `mkdir` 锁目录和 `kill -0` 进程存活检查，两个同时到达的 LuCI 请求不会再并行覆写输出文件；增加可注入路径/命令以支持本地回归测试。
- `ota-check.sh` 在下载前严格校验 HTTPS 地址、SHA256 长度/字符集与镜像大小范围，避免异常更新清单进入算术计算或下载流程。
- 插件中心停止服务前增加二次确认，避免误触关闭路由器关键服务。
- 静态阅读站点为文档与搜索弹窗增加 Tab 焦点边界，键盘用户不会意外移出模态对话框。
- 新增 `scripts/check-ota-wrapper.js`，纳入 CI，覆盖 OTA 包装器锁、完成标记与输出重定向约束。
- 健康检查和 CI 的 Bash 语法范围补上无扩展名的 `ota-check-ui` 包装器，避免只检查 `.sh` 而漏掉 LuCI 直接执行文件。
- 站点交互回归新增文档/搜索模态 Tab 焦点边界断言，Edge 回归由 7 项扩为 9 项。

- 官方升级资料同步至 OpenWrt 25.12.6：更新 RE-CP-02 的 sysupgrade/initramfs 文件名、官方下载地址与 SHA256，并同步阅读站点展示（哈希已与官方 `sha256sums` 逐字节核对）。
- 修复 Windows 健康检查误选 WSL `bash.exe` 导致 shell 语法检查失败的问题，优先探测 Git Bash。
- 修复：`scripts/*.sh` 与 `luci-app-ota-check/root/usr/bin/ota-check-ui` 在 git 索引里是 `100644`，Linux 上无法直接执行、LuCI 的 `fs.exec` 也会失败。已全部改为 `100755`。
- 健康检查的可执行位检查在 PowerShell 5.1 下改为回落到 `git ls-files -s` 的 mode 位，不再一律 SKIP（此前 6 个脚本的权限问题因此一直未被发现）；检查范围补上无扩展名的 `ota-check-ui`。
- 修复 docs/05 UPnP 安装命令：25.12 起 `miniupnpd` 拆分为 `miniupnpd-nftables` / `miniupnpd-iptables`，原 `apk add miniupnpd` 必然报「包不存在」。
- 修复 Glass 主题登录页模板：`footer_login.ut` 的 `luciLocation` 由裸插值改为 `json()` 序列化，避免路径含引号时登录页脚本被截断（1.3.0 只修了 `footer.ut`）。
- 阅读站点三处修复：文档弹窗打开时焦点落到无 `tabindex` 的遮罩上（实际未聚焦），改为聚焦带 `tabindex="-1"` 的标题；翻页后原按钮被 `innerHTML` 替换导致焦点掉回 body，改为重新聚焦标题；搜索框清空后旧请求仍会回写结果，改为在提前返回前递增请求代次。
- 更新中心视图按发布约定改名为 `update-center5.js` 并同步 menu.d：版本检测按钮改为按缓存清单动态生成，删掉硬编码的「检测 23.05.7」死按钮（视图渲染在节点挂载前执行，容器改用局部引用而非 `getElementById`）。
- 安全加固 `scripts/ota-check.sh`：从 manifest 的 `sysupgrade.url` 取末段文件名时增加白名单（拒绝 `..`、绝对路径、含 `/` 或隐藏文件），避免恶意 manifest 让镜像写到 `$OTA_TMP` 之外；文件名不是 `*-squashfs-sysupgrade.bin` 时给出警告。
- 新增 `scripts/check-consistency.js`：比对 6 个位置的官方基线版本号、哈希、下载链接与校验日期，以及 OTA 清单内部自洽；防止「官方基线只改一半」重演。
- 新增 `scripts/check-ota-view.js`：用最小桩模拟 LuCI 视图生命周期，断言版本按钮按清单生成、空/非法清单不崩溃、轮询依赖的节点 id 存在。已用旧版 `update-center4.js` 反证（8 项 FAIL）。
- 新增 `scripts/check-site-interaction.js`：CDP 驱动 headless Edge/Chrome 真实点击，验证弹窗焦点、翻页焦点、Esc 分层关闭与搜索清空竞态。已用 `HEAD` 版 `site/app.js` 反证（3 项 FAIL）。
- 健康检查新增版本一致性与 OTA 视图逻辑两项，纳入 `SUMMARY`。
- 新增 `.github/workflows/checks.yml`：只读 CI，覆盖 shell/JS 语法、可执行位、CRLF 检查、版本一致性、OTA 视图逻辑、PassWall 回归、JSON 可解析、menu.d 视图存在性、文档本地链接、站点资源冒烟与站点交互回归。不下载固件、不接触设备。
- 新增 `luci-app-ota-check/README.md`：补齐该应用一直缺失的部署、校验与卸载步骤（含 `chmod +x`、`rpcd` 重启、缓存清理）。
- docs/09 新增「从 ImmortalWrt 转官方 OpenWrt 会失去什么」：实测官方 25.12.6 的 feed 不含 `luci-theme-argon` 与 PassWall，转 fork 会导致 Glass 主题失去依赖、PassWall 不可用；附迁移前检查清单与恢复顺序。
- docs/09 升级后验证修正：`ping -c 4 192.168.1.1` 在路由器上执行是自环，改为 ping 外网 + 从电脑侧验证管理面。
- 文档占位符与包管理器统一：`ota/README.md` 的 `opkg install` 改 `apk add`（并注明 24.10 设备回退 opkg）、`192.168.2.1` 统一为 `<ROUTER_IP>`，菜单名统一为「更新中心」；theme-patch README 补 argon 版本基线与 `json()` 注意事项。

> 本次发布**未**在真实 RE-CP-02 上验证：三款 LuCI 应用的 ACL/RPC 行为、OTA 下载与刷写、eMMC 扩容、温度与无线数据仍需实机确认。CI 与本地检查只覆盖静态与前端逻辑。

### 升级提示

- 这是项目资料与工具更新，固件版本仍由上游更新源独立维护。HTTPS 和 SHA256 不等于固件签名认证。
- 跨 ImmortalWrt／OpenWrt 迁移前需核对分区布局和插件来源；Glass 依赖 Argon，不能假定另一发行版的软件源包含所有原插件。
- 保留原始下载资产。本版本 SHA256 清单条目带 release/ 前缀，手工校验时需按该路径放置文件，或使用校验工具逐项比对；v1.5.0 改为同目录文件名。
- 此版本记录不代表设备上的 ACL、OTA 刷写、eMMC 扩容、温度及无线数据均已验收。

历史依据：[4de4b3c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4de4b3c78e3ce01f32845ae3b4c31a030461a46e) · [bf7f65e](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/bf7f65e673e1ab6e1f405b5d36e6d83da28fa3a3) · [db15197](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/db15197ca48ba820bcac1874ca51c23a1d8c386e)。

## 1.4.0 - 2026-11-08

**版本重点：** 扩展设备状态展示，把服务操作、更新源切换和阅读进度放到常用入口。

### 详细变更

- 状态面板升级（`panel.js` → `panel2.js`，同步 menu.d）：新增温度卡片（读 `/sys/class/thermal/thermal_zoneX/temp`，毫度转摄氏度，无 thermal zone 显示 `--`）与无线客户端数（优先取 `network.wireless status` 各接口 `stations`，固件未提供时走 `iwinfo.assoclist` ubus 兜底）。ACL 收窄为只读 ubus + 文件读取，**不再让页面执行外部 `iwinfo` 命令**。
- 插件中心升级（`dashboard2.js` → `dashboard3.js`，同步 menu.d）：已安装服务卡片底部新增「启动 / 停止 / 重启」，`fs.exec` 调 `/etc/init.d/<name> <action>`，完成后自动重读状态徽标；操作按钮从卡片链接里拆出（链接改为卡片内 `.hub-card-link`），杜绝点按钮误触发整卡跳转；`acl.d` 增加 `/etc/init.d/*` 的 `file exec`。
- 更新中心升级（`update-center3.js` → `update-center4.js`，同步 menu.d）：更新源可切 GitHub（主源）/ Gitee（备用），选择写入 `re-cp-02-ota-source` 刷新后保留；`scripts/ota-check.sh` 新增 `--source gitee|github`（默认 GitHub raw，Gitee 仅作备用），`ota-check-ui` 透传参数，日志标注实际命中的源。
- 阅读站点：正文搜索改为按文档分组（每篇最多 6 条、总共 30 条，触顶提示缩小关键词），搜索索引逐行缓存小写副本，消除每次输入重复 `toLowerCase()`；阅读进度在翻页与关闭两条路径都会保存（此前点「下一篇」会丢掉当前文档的滚动位置）。
- 主仓库链接统一到 GitHub：README clone 地址、站点历史/个人固件卡片与 Footer、`ota/README.md` 自托管 raw 地址与推送说明；Gitee 只保留为 OTA 备用源。
- 修复：新增 `.gitattributes` 强制 `*.sh` 与 `ota-check-ui` 按 LF 检出——Windows `core.autocrlf=true` 默认把文本检出成 CRLF，`scp` 上机会让 BusyBox ash 在首行 `set -u` 报 `Illegal option` 直接退出；同时把工作区已变成 CRLF 的 4 个脚本归一回 LF。
- 健康检查 `project-health-check.ps1` 新增全部 `.sh` 的 `bash -n` 语法校验与可执行位检查（PowerShell 7+ 用 `GetUnixFileMode`，5.1 下降级 SKIP）。

### 升级提示

- 更新 LuCI 组件时需同时更新对应视图、菜单和权限文件，否则可能看到旧页面或遇到权限拒绝。
- 此版本服务命令结果和运行徽标的判断仍有不足，v1.5.0 已修复；有服务控制需求建议使用后续版本。
- 切换下载源不会跳过型号、发行版和完整性校验，也不会自动刷写。该历史 Release 没有单独上传自定义资产。

历史依据：[5ec6826](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/5ec6826fa1821646c46aca4b6bad827b9fe8f293)。

## 1.3.0 - 2026-11-06

**版本重点：** 增加路由器状态面板、深浅主题，以及具备预览和确认步骤的维护工具。

### 详细变更

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

### 升级提示

- eMMC 扩容会重新分区并清空目标设备，网络急救会重启网络并可能断开 SSH；应先备份、核对设备并阅读预览。
- Glass 沿用 Argon 依赖及 ImmortalWrt 25.12 适用范围，不能据此宣称适配所有固件。
- 本版无独立 GitHub Release；日期沿用原日志的 11 月 6 日，相关实现于 11 月 7 日提交。早期服务徽标的判断在 v1.5.0 进一步修正。

历史依据：[b3937bf](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/b3937bfaba0d9bcf36e91922efc508d753300480) · [e34ba67](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e34ba675cc4ac20f977c379de0fa86e4404fa951) · [660aa69](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/660aa6967507a4dec92028c7b711ec85e6ffe36f) · [e3d1d94](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e3d1d944521ee3605c05dbad4f7921b27ed42e0e) · [45de8dd](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/45de8dd7ace0308e862738dcfe703494fb0b2387) · [ae3d2f5](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ae3d2f5b09d4214767d3db2084b2310106cc722c)。

## 1.2.5 - 2026-10-07

**版本重点：** 修复 Glass 表单显示、PassWall 工具栏和更新中心跳转。

### 详细变更

- Glass 主题修复：系统设置等带选项卡的表单页整卡发白（ImmortalWrt 25.12 的 form.js 选项卡面板不带 `cbi-tabcontainer` 类，argon 以 `[data-tab-title]` 刷白底，半透明玻璃卡叠白底全卡洗白）；面板与 argon 其余白底卡片容器（网络/无线/opkg/防火墙/错误框）统一归零露出深色底，已用真实 cascade.css + form.js DOM 本地复现验证。
- passwall-node-list-enhance：补回整文件替换时丢失的原生工具栏（添加 / 删除选择的节点 / 全选）——原生删除按钮同时是增强按钮的注入锚点，缺失会导致"四目标测速并排序"等按钮永不出现；回归测试补 2 条对应断言（实机已核对上游模板 1248-1249 行的按钮形态）。
- 更新中心：「备份与更新」链接修正为 `admin/system/flash`（实机 luci-mod-system 菜单无 `admin/system/backup`，原为死链）。
- manifest：25.12.2 条目补 `kernel: 6.12`（实机 `uname -r` = 6.12.103）。
- 核对结论：插件中心「流量统计」指向 `admin/services/nlbw` 与实机 nlbwmon 菜单一致，无需修改。

### 升级提示

- 更新主题和视图后需刷新缓存；按部署文档同步更新资源版本和菜单路径。
- 补充内核信息不代表发布了新固件，也不改变推荐更新分支。

历史依据：[05b828c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/05b828cd6d7d7ad722ab6a30eda2fabec2f163c3) · [7a097a4](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/7a097a439b2f1883711915356c8ee57f34966e81) · [ac58b2d](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ac58b2d6c5f186836a02635ab424858a1acb05f0) · [eceab80](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/eceab800cc89af4037efb07ffbf9219abcdcbb4f)。

## 1.2.4 - 2026-10-07

**版本重点：** 修复订阅内容展示风险与更新轮询故障，首次提供插件中心。

### 详细变更

- 安全修复：PassWall 节点列表补丁（node_list.htm）对订阅侧备注/地址/分组名/协议等远程数据统一 HTML 与 JS 字符串转义，消除存储型 XSS；同步修复手动测速 NaN 卡格、重复地址索引双写、斑马纹 class 未落到表格行、当前节点回调缺 null 守卫、列表加载失败无占位提示与缓存清理跳键；回归测试新增 7 条转义断言。
- ota-check 修复：rpcd ACL 的 `ubus.file` 白名单补上 `read`，修复独立部署时页面轮询全部被拒、检测成功却显示"后台任务超时"；新增 `--sysupgrade-args="-n"` 等号形式解析（此前按文档示例调用必报未知参数退出）。
- 更新中心页：更新日志按版本号新→旧排序（此前按 manifest 收录顺序原样渲染，24.10.6 排在 25.12.2 前）；日志标题展示清单 `generated` 日期——路由器读的是上次检测时缓存的 `/tmp/ota-manifest.json`，数据过期一眼可见。
- 更新源一致性：`ota/manifest.json` 的 `latest` 修正回 24.10.6，25.12.2 恢复为仅手动 `--version` 检测，与 README/CHANGELOG 的"不参与自动检测提示"承诺对齐。
- site 修复：`###` 标题不再复用 `##` 的目录锚点（修复 docs/09 目录跳转错位与重复 id）；Markdown 表格在空行/标题/列表/引用处正确闭合；localStorage 被禁用时站点初始化不再整体中断。
- project-health-check.ps1 在 Windows PowerShell 5.1 下 `node --check` 与 `git` 的 stderr 不再终止整个检查，语法失败会正确计入 FAIL 并输出 SUMMARY。
- 文档同步：README 目录树补录三个自制 LuCI 组件、诊断脚本参数表补 `-RemoveStaticIPs`；docs/02 为主线（第三方 U-Boot）设备补上应刷镜像文件名；docs/08 Xray 核心表述改为按校验值自行获取；docs/01 静态地址回退补 `Remove-NetIPAddress`；docs/05 get-wan6-ip 补上传路由器步骤；docs/09 scp 示例修正 `./` 路径；get-wan6-ip.sh 排障提示改为 `ubus list` 查接口。
- backend-patch.md 补全 test.sh 分发行三参透传的改后代码与漏改后果、验证方法。
- 仓库清理：删除根目录调试残留 `tmp_luci.json`/`tmp_pk.json`，`.gitignore` 收敛 `*node*` 规则并补 `tmp_*.json` 与 `.zcode/`。
- 历史补录（1939ae9）：首次加入 luci-app-plugin-hub 及菜单，提供统一插件入口；服务启停在 1.4.0 才加入。

### 升级提示

- 早期 PassWall 增强页面用户应更新此安全修复，保留自己的配置和原文件备份。
- 更新中心需同步更新权限文件并刷新相关服务；仅替换页面不能解决读取被拒问题。
- 25.12.2 仍是跨大版本的人工选择，不应把临时测试阶段的推荐设置当作当前建议。

历史依据：[1939ae9](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/1939ae9a66fd538b972ffae3192e303be5f6e91f) · [ec65b0f](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/ec65b0f804421b9566b2b78190c4893359d6332a)。

## 1.2.3 - 2026-10-06

**版本重点：** 增加 ImmortalWrt 25.12.2 手动选择，并记录同期更新中心与主题改进。

### 详细变更

- 固件更新源收录 ImmortalWrt 25.12.2（新大版本分支，SHA256 取自官方 sha256sums）：`latest` 保持 24.10.6，自动检测不提示跨大版本升级；25.12.2 仅供手动下载尝鲜，刷写建议不保留配置并重装核对代理插件等服务。
- 同期补录（4c3b172、c6c89d5、52a49df、29da690、4c9054c）：在 1.2.4 之前，页面更名为更新中心、引入依赖 Argon 的 Glass 主题并修复部分白底和下拉裁切；这些改进未单独编号。

### 升级提示

- 原版本说明保留 24.10.6 为推荐目标；之后曾临时把 25.12.2 设为推荐用于链路测试，v1.2.4 已恢复。历史中间提交不能作为当前升级建议。
- 从 24.10 切换到 25.12 属跨大版本升级，应先备份，评估不保留配置，并重新核对代理等服务。
- 同期主题改进没有独立版本号；当时面向 ImmortalWrt 25.12，不能推定已适配 24.10 或官方 OpenWrt。

历史依据：[e0d44af](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/e0d44af76c9889f6cf086958478ce90e64a8d2f3) · [2407602](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/24076028a9d05e6fd8aa9eb7328690c0224ebd8d) · [4c3b172](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4c3b1723c8bc80461d29d9b4e64f3c922ac8ba19) · [c6c89d5](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/c6c89d5ba3a756ace2de91105aa87a878a5c4f9e) · [52a49df](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/52a49df894b86f5008210ae17d4c0e5cae18784e) · [29da690](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/29da69038f5fbbbd7f51c4554830f25603a18c4b) · [4c9054c](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/4c9054c8c57dbacc715458d8bea05b6ae34413c8)。

## 1.2.2 - 2026-10-06

**版本重点：** 增加多目标节点测速与筛选，补充更新日志展示和可选主题信息。

### 详细变更

- 新增可选 `luci/passwall-node-list-enhance/`：PassWall 节点列表 URL 测试列扩展为百度、谷歌、GitHub、Instagram 四个固定目标，"四目标测速并排序"按钮按节点数 × 4 任务（最多 8 并发）测速后按四目标最低延迟排序，并提供"删除超标节点"筛选按钮（任一目标 `≥1500 ms`，`1499 ms` 不勾选；缺失/超时/错误不删除，删除保留原生二次确认）。
- 新增 `luci/passwall-node-list-enhance/backend-patch.md`：上游 `urltest_node` 不支持自定义目标，说明如何给 PassWall/PassWall2 的 controller 与 `test.sh` 套用 `target` 白名单补丁（四个固定标识，不接受任意 URL，未知值回退全局 `url_test_url`）。
- 增加 `scripts/check-passwall-node-list-enhance.js` 回归测试，覆盖四目标固定 URL、1500ms 等号边界、缺失/超时数据、四倍任务计数、有界并发、分组范围、排序、删除二次确认和后端白名单文档检查。
- 补丁不包含订阅、节点、密码或 Token；部署采用先下载到临时文件、备份后再替换的流程。
- 历史补录（1ec4dc3、74dc302）：更新源页面增加版本更新日志，可选 Argon 模板增加版本行和登录页动态背景。

### 升级提示

- 四目标测速需配套适配后端，仅替换前端不够；部署前备份原文件，核对实际 PassWall／PassWall2 版本。
- 排序反映当前网络及固定目标下的测速结果，不代表节点整体质量；补丁不附带节点、订阅或凭证。
- 建议使用后续修复版本：v1.2.4 加固订阅内容展示，v1.2.5 补回可能缺失的原生工具栏。

历史依据：[1ec4dc3](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/1ec4dc30953b74a0b3c76002a80f9e8d8c563441) · [74dc302](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/74dc30297ee19d41698fd61eabb90e3d37e96030) · [5ff7290](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/5ff729030d7334f6205cd06ad8ecc3ffe6808929)。

## 1.2.1 - 2026-10-05

**版本重点：** 把命令行更新检测和下载带到 LuCI 页面。

### 详细变更

- 新增 `luci-app-ota-check`：LuCI 系统 → 固件更新源页面，提供检测/下载按钮（后台执行 + 轮询结果，规避 rpcd file exec 长阻塞）。
- manifest 措辞调整以规避 Gitee raw 内容审查 451（移除 PassWall 关键词）。
- ota-check.sh 默认更新源地址修正为 main 分支。

### 升级提示

- 页面提供检测和下载，不直接刷写；安装仍需人工确认，更新源可达性取决于网络与托管服务。
- 独立部署需配套脚本、菜单及权限文件；早期轮询读取权限不足的问题于 v1.2.4 修复。

历史依据：[6657ac4](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/6657ac4f55ef207a6ad059fbb6fb36952bde7a9d) · [dd7c5d6](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/dd7c5d60a7cc1e94eec911a74aee701b4f321cdb)。

## 1.2.0 - 2026-10-05

**版本重点：** 建立设备更新清单，提供检测、下载校验与人工确认刷写流程。

### 详细变更

- 新增自有固件更新源 `ota/`：manifest.json 记录 RE-CP-02 可用版本（首发收录 ImmortalWrt 24.10.6 与 23.05.7，SHA256 均取自官方 sha256sums 并逐一核对），附发布流程说明。
- 新增 `scripts/ota-check.sh` 路由器端更新检测：只读检测 / 下载校验 / 人工确认刷写三档，内置 RE-CP-02 型号门禁、发行版一致性与 SHA256 钉死，跨大版本刷写强制人工确认。
- 新增 `scripts/router-post-flash-cleanup.sh` 刷机后清理：停用 ttyd 网页终端与 DDNS 占位配置，默认干跑预览。
- README 工具箱扩充为五个小工具并同步目录树。

### 升级提示

- 项目版本 1.2.0 与固件版本互相独立，新增清单不表示已经替用户更新设备。
- 执行清理或刷写前先阅读预览并备份；摘要不等于签名认证，跨大版本配置保留需要人工判断。

历史依据：[0118930](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/011893061e653c670d857003f34824e8151ed266)。

## 1.1.1 - 2026-10-05

**版本重点：** 清理历史固件与重复资源，让源码下载用户也能进行健康检查。

### 详细变更

- 移除无任何引用的 stock 固件二进制 `Tftpd64/JDCOS.bin`，仓库内容与「不包含固件二进制」策略保持一致；Tftpd64 目录收敛为一份 exe 与一份 ini，删除重复的汉化版子目录。
- 删除未使用的站点图片 `site/assets/hero-router-alt.jpg`，健康检查同步移除该项；清理 styles.css 中无引用的 `.ambient`、`.doc-index`、`.doc-arrow` 死样式。
- 官方 25.12.5 sysupgrade 与 initramfs 镜像的 SHA256 并入 `firmware/SHA256SUMS.txt`（现共 8 项），健康检查可覆盖官方升级基线。
- 健康检查脚本在非 git 目录或缺少 node 时输出 SKIP 而不再 FAIL，zip 下载用户可直接运行。
- 补充 docs/08 中 Xray 核心的上游版本核对提示，刷新站点首页「最后校验」日期。

### 升级提示

- 使用资料仍需自行获取可信固件，不能因为源码包里没有镜像就换用其他型号文件。
- 本版无独立标签；与 v1.2.0 的记录及改动由同一提交保存，此处保留原日志的版本划分。

历史依据：[0118930](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/011893061e653c670d857003f34824e8151ed266)。

## 1.1.0 - 2026-08-30

**版本重点：** 补齐官方固件升级、备份与回滚主线。

### 详细变更

- 增加官方 OpenWrt 25.12.5 更新、备份、owut、sysupgrade 与回滚章节。
- 将官方 RE-CP-02 镜像设为阅读站首要升级基线，保留历史和个人构建的独立说明。
- 增加项目健康检查脚本，覆盖站点资源、文档映射、脚本语法和 SHA256 清单策略。
- 整理社区 RE-CP-02 设备实践来源、许可证边界和不同分区布局的混用风险。
- 补充 25.12 `mipsel_24kc` 包架构检查，并强化初次刷写前的官方/第三方分区布局闸门。

### 升级提示

- 刷写前区分官方与第三方 U-Boot／分区布局，不能只凭处理器平台判断固件是否通用。
- 安装软件前核对 25.12 的 mipsel_24kc 包架构；25.12.5 是当时基线，不代表当前最新版。

历史依据：[3869917](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/3869917df2b7579deea099e89ca0fca4fa28bde9)。

## 1.0.0 - 2026-08-13

**版本重点：** 形成覆盖准备、刷机、配置与恢复的首个 1.x 指南版本。

### 详细变更

- 持续更新 JDCloud RE-CP-02 OpenWrt 指南，包含 9 篇核心文档、固件清单、排障路径和网页阅读入口。
- 增强网页阅读体验：文档目录、上一篇/下一篇、代码复制、正文搜索结果摘要、滚动进度和渐显动画。
- 修正准备工作与刷机流程中的推荐固件文件名，统一指向含 TF 卡驱动的 sysupgrade 固件。
- 补充 eMMC 备份前的挂载提示，并把 SCP 示例改成通用电脑账号和 IP 占位符。
- 增加 Xray soft-float 资产校验记录，便于恢复 v2rayA 全局分流配置。
- 增加正式刷机前核对 OpenWrt 官方最新版的安全提醒，避免把仓库实测文件误当作长期最新版。

### 升级提示

- 历史镜像用于说明当时实测流程，正式刷写前仍要核对官方版本、型号和文件用途。
- 本版本有 Git 标签，目前没有对应 GitHub Release 页面；日期沿用原日志 2026-08-13。

历史依据：[dc8c167](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/dc8c167963f1e3f35b45460fedb56ace7540290a)。

## 0.2.0 - 2026-08-09

**版本重点：** 增加无需构建的网页阅读入口，完善资料脱敏。

### 详细变更

- 增加零依赖的玻璃质感网页阅读入口，根目录访问会进入 `site/`。
- 补齐 9 篇文档卡片，支持全文搜索、弹窗阅读、章节内链、主题持久化和移动端布局。
- 增加真实路由器首屏视觉、滚动进度、渐显动画、键盘焦点样式与 favicon。
- 脱敏全球分流文档中的节点域名、IP、Reality 参数，并清理 Tftpd64 配置中的默认密码和本机租约信息。
- 重新校验仓库内 5 个核心固件与 U-Boot 的 SHA256。

### 升级提示

- 通过本地 HTTP 服务加载文档，直接打开 HTML 可能无法读取章节。
- 恢复配置时需使用自己的数据；历史文件清单不保证长期仍可下载。

历史依据：[d4c92d9](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/d4c92d993a2cb9176034fa6efaf526f45eae3740)。

## 0.1.1 - 2026-07-28

**版本重点：** 整理来源署名、固件目录和摘要核对依据。

### 详细变更

- 补充原始参考资料和固件说明的来源与致谢。
- 将当时随仓库提供的固件二进制整理到 firmware/。
- 为随附固件增加 SHA256 校验清单。

### 升级提示

- 这是早期布局记录：当时包含固件二进制，后续已改为主要保留说明和摘要，不能把此条当作当前下载方式。
- 使用历史文件前仍应核对来源、RE-CP-02 型号及摘要。

历史依据：[cf4f9b1](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/cf4f9b130140bfe5fafb67f9f6e8ae8fa9b0703f)。

## 0.1.0 - 2026-07-28

**版本重点：** 首次公开 RE-CP-02 刷机与家庭网关配置指南。

### 详细变更

- 首次公开 JDCloud RE-CP-02 指南。
- 增加刷机、首次启动、eMMC overlay、常用服务、v2rayA 和排障文档。
- 增加已脱敏的 Windows 网络诊断脚本。
- 增加 LuCI v2rayA 快捷入口示例。

### 升级提示

- 本版以手工指南与辅助脚本为主，不会自动获取设备权限或刷机；擦写和分区步骤需自行确认并备份。
- 私人配置使用占位符，实际使用时应填写自己的网络信息。

历史依据：[839144b](https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/commit/839144bbd97d8b25ec34a7926c16639a91efb586)。
