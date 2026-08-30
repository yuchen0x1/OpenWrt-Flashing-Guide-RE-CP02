# 给京东云无线宝鲁班二代（RE-CP-02）刷 OpenWrt：从接线到家庭网关一条龙

> **这份文档写给谁？**
> 你手上有一台京东云无线宝鲁班二代（JDCloud RE-CP-02，板型 r4310，ramips / mt7621 平台），想把它刷成 OpenWrt 25.12.x，并顺手配好一个能用的家庭网关——LAN / WAN / WiFi、中文界面、DNS / DoH、广告过滤、UPnP、SQM、dynv6 DDNS、v2rayA 分流，本文档从头到尾都有对应章节。
>
> **先说丑话（务必读完再动手）：**
>
> - 刷机、写入 U-Boot、重建 eMMC 分区，**任何一步都可能变砖或丢失数据**，请只在自己拥有或已获授权维护的设备上操作。
> - 本仓库**不是自动刷机工具**：不会自动连接路由器，不会替你开 Telnet、写 U-Boot 或刷入 OpenWrt，一切操作由你亲手完成、责任自负。
> - 仓库**不包含固件二进制**，`firmware/` 目录只有文件说明和 SHA256 清单。刷机前必须自行核对下载来源、文件名、设备型号和哈希；**严禁把其他 MT7621 设备的固件混刷到 RE-CP-02**。
> - 仓库不收录 stock 固件下开启 Telnet 的辅助代码，只讲流程与风险；也不内置任何私人节点、订阅、WiFi 密码、DDNS Token、SSH 密钥或完整个人配置。

项目持续更新中：文档、辅助脚本与本地静态阅读站点均在正常维护。完整免责声明见 [DISCLAIMER.md](DISCLAIMER.md)，安全报告与敏感信息要求见 [SECURITY.md](SECURITY.md)。

---

## 目录

1. [仓库里有什么](#仓库里有什么)
2. [获取本仓库](#获取本仓库)
3. [本地阅读站点](#本地阅读站点)
4. [动手前核对清单](#动手前核对清单)
5. [刷机主线：九篇文档按序读](#刷机主线九篇文档按序读)
6. [固件与校验值](#固件与校验值)
7. [工具箱：三个实用小工具](#工具箱三个实用小工具)
8. [遇到问题先查这里](#遇到问题先查这里)
9. [高频问答](#高频问答)
10. [参与贡献与维护约定](#参与贡献与维护约定)
11. [交流与反馈](#交流与反馈)

---

## 仓库里有什么

```text
.
├── README.md                         ← 你正在看的项目入口
├── index.html                        ← 根入口，访问后跳转到 site/
├── docs/                             ← 9 篇刷机、配置与排障文档（主线内容）
├── site/                             ← 零构建静态阅读站点
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/                       ← 站点图片资源
├── firmware/
│   ├── README.md                     ← 固件文件用途说明
│   └── SHA256SUMS.txt                ← 固件与 Xray 文件的 SHA256 清单（共 6 项）
├── scripts/
│   ├── router-net-diagnose.ps1       ← Windows 网络诊断脚本
│   └── get-wan6-ip.sh                ← OpenWrt 上读取 wan6 IPv6 地址
├── luci/
│   └── 05_v2raya.js                  ← LuCI 总览页 v2rayA 快捷入口示例
├── Tftpd64/                          ← TFTP 辅助材料
├── SECURITY.md                       ← 敏感信息与安全报告说明
├── DISCLAIMER.md                     ← 免责声明
├── CONTRIBUTING.md                   ← 贡献说明
├── CREDITS.md                        ← 来源与致谢
├── CHANGELOG.md                      ← 更新日志
└── LICENSE                           ← MIT License
```

几句话概括这份仓库的构成：

| 组成部分 | 一句话说明 |
| --- | --- |
| 主线文档（docs/） | 准备 → 接线 → Telnet → 备份分区 → 写 U-Boot → Web Recovery → 首次启动 → 网关配置 → 排障，全程图文 |
| 阅读站点（site/） | 无需构建的纯静态网页：章节弹窗、正文搜索、代码复制、SHA256 复制、浅色模式、移动端适配 |
| 校验清单（firmware/） | U-Boot、initramfs、sysupgrade 固件与 Xray 文件的 SHA256，用于刷机前逐项比对 |
| 辅助脚本（scripts/） | Windows 网络诊断 + OpenWrt IPv6 查询，两个即拷即用的小脚本 |
| LuCI 示例（luci/） | 放进 LuCI 总览页即可一键打开 `:2017` v2rayA 管理页 |
| eMMC 扩容文档 | RE-CP-02 内置 eMMC 重新分区、格式化、迁移 overlay 与验证的完整记录 |

---

## 获取本仓库

```sh
git clone https://gitee.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02.git
cd OpenWrt-Flashing-Guide-RE-CP02
```

不想用 git 的话，也可以在仓库页面直接「克隆 / 下载」打包 zip 解压使用，效果相同。

---

## 本地阅读站点

站点通过浏览器 `fetch()` 读取 `docs/*.md`，**请务必走本地 HTTP 服务访问，不要直接双击 HTML 文件**——部分浏览器会因本地文件权限限制而无法加载章节内容。

```sh
# 在仓库根目录执行
python -m http.server 18765 --bind 127.0.0.1
```

然后浏览器打开：

```text
http://127.0.0.1:18765/
```

根目录 `index.html` 会自动跳转到 `site/`。站点由 `site/index.html` 与 `site/app.js` 驱动：流程卡片、Markdown 章节弹窗、正文搜索、复制代码块、复制固件 SHA256、浅色 / 深色模式切换都可以直接使用。

**运行环境一句话**：现代浏览器（Chrome / Edge / Firefox 等）+ Python 3（或任意静态文件服务器）。本项目零依赖：没有 npm / pnpm / yarn / pip 依赖，不需要构建，没有环境变量，也不提供 Dockerfile 或 Compose 配置。

---

## 动手前核对清单

刷机前请逐项确认，任何一项没把握都先回到对应文档补课：

| 序号 | 核对项 | 参考章节 |
| --- | --- | --- |
| 1 | 设备型号确认：京东云无线宝鲁班二代 / JDCloud RE-CP-02 / r4310（ramips / mt7621） | [准备工作与文件说明](docs/00-preparation.md) |
| 2 | 固件下载来源、文件名与设备型号匹配，SHA256 与 `firmware/SHA256SUMS.txt` 逐项一致 | 本页 [固件与校验值](#固件与校验值) |
| 3 | 记住三个关键地址：stock / U-Boot Recovery 为 `192.168.68.1`；OpenWrt 初始地址通常为 `192.168.1.1`；本文档示例 LAN 地址为 `192.168.8.1` | [接线与电脑网络设置](docs/01-network-topology.md) |
| 4 | 网线直连路由器 LAN 口；电脑系统 Windows / Linux / macOS 均可（示例偏 Windows 与 OpenWrt shell） | [接线与电脑网络设置](docs/01-network-topology.md) |
| 5 | 终端与传输工具备齐：PowerShell、Windows Terminal、MobaXterm、PuTTY、ssh / scp；Telnet 客户端（Windows 可启用 Telnet Client）；临时 HTTP 服务、SCP、TFTP 等传输方式；`certutil`（Windows）或 `sha256sum`（Linux / macOS） | [准备工作与文件说明](docs/00-preparation.md) |
| 6 | 备份步骤不做跳过：分区备份是变砖后恢复的最后底牌 | [刷机流程](docs/02-flashing.md) |

必要时电脑可另连手机热点查资料或下载包，与直连路由器的有线网络互不干扰。

---

## 刷机主线：九篇文档按序读

**请按顺序阅读操作，不要跳过备份与校验步骤：**

| 步骤 | 文档 | 内容 |
| --- | --- | --- |
| 第 1 步 | [准备工作与文件说明](docs/00-preparation.md) | 工具、文件与前置知识 |
| 第 2 步 | [接线与电脑网络设置](docs/01-network-topology.md) | 网络拓扑与网段切换 |
| 第 3 步 | [刷机流程](docs/02-flashing.md) | Telnet、分区备份、写入 U-Boot、U-Boot Web Recovery |
| 第 4 步 | [OpenWrt 首次启动](docs/03-first-boot.md) | LuCI、中文界面、WiFi、WAN |
| 第 5 步 | [eMMC 扩容到 overlay](docs/04-emmc-overlay.md) | 内置 eMMC 重新分区、格式化、迁移 overlay 与验证 |
| 第 6 步 | [常用服务配置](docs/05-common-services.md) | LAN、WAN、DNS / DoH、广告过滤、UPnP、SQM、dynv6 DDNS |
| 第 7 步 | [v2rayA 分流与快捷入口](docs/06-v2raya.md) | v2rayA 分流配置与 LuCI 快捷入口 |
| 第 8 步 | [常见问题排查](docs/07-troubleshooting.md) | 代理影响 LuCI、DDNS 更新失败、Recovery 进不去等 |
| 第 9 步 | [路由器全球分流恢复](docs/08-router-global-access.md) | 路由器侧分流恢复 |

---

## 固件与校验值

`firmware/SHA256SUMS.txt` 当前记录 **6 个文件**的校验值：

| 文件 | 用途 |
| --- | --- |
| `u-boot-mt7621-68.bin` | 第三方 U-Boot，提供 Web Recovery |
| `openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | 临时启动用 initramfs |
| `openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，含 TF 卡驱动 |
| `openwrt-25.12.0-rc2-无TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，无 TF 卡驱动 |
| `openwrt-25.12.1-自用-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | 作者自用 sysupgrade 固件 |
| `xray-softfloat-26.7.28-linux-mipsle` | v2rayA / PassWall 恢复使用的 linux/mipsle soft-float Xray 核心 |

> ⚠️ **需要人工确认**：本 Git 仓库不含上述二进制文件。刷机前请自行确认下载来源、设备型号、文件名与 SHA256；**不要把其他 MT7621 设备固件混刷到 RE-CP-02**。

**Windows 校验示例：**

```powershell
certutil -hashfile .\firmware\openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
certutil -hashfile .\firmware\u-boot-mt7621-68.bin SHA256
```

**Linux / macOS 校验示例：**

```sh
sha256sum firmware/openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
sha256sum firmware/u-boot-mt7621-68.bin
```

把命令输出与 `firmware/SHA256SUMS.txt` 中的记录逐项比对，全部一致再继续刷机。

---

## 工具箱：三个实用小工具

### 工具一：Windows 网络诊断脚本

普通诊断：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1
```

指定网卡并尝试添加常见静态 IP：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1 -AdapterName "Ethernet" -ConfigureStaticIPs
```

诊断结果默认写到 `router-net-diagnose-result.txt`。

**参数一览：**

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-AdapterName` | 空 | 指定有线网卡名称；为空时脚本自动选择处于 Up 状态且不像虚拟 / WiFi / VPN 的网卡 |
| `-ResultPath` | `.\router-net-diagnose-result.txt` | 诊断结果输出路径 |
| `-ConfigureStaticIPs` | 关闭 | 使用管理员权限时，为目标网卡添加 `192.168.68.2`、`192.168.1.2`、`192.168.8.2` 三个 `/24` IPv4 地址 |
| `-TcpTimeoutMs` | `1000` | TCP 端口探测超时，单位毫秒 |

**脚本会检查**：是否管理员权限；目标网卡名称、接口索引、状态与链路速率；当前有线 IPv4 地址；`192.168.68.1` 的 80 / 22 / 23 端口；`192.168.1.1` 的 80 / 22 端口；`192.168.8.1` 的 80 / 22 / 2017 端口；当前 ARP 表。

> 放心：默认情况下脚本**不会修改你的网卡**，只有显式传入 `-ConfigureStaticIPs` 且以管理员权限运行时，才会添加上述静态 IPv4 地址。

### 工具二：OpenWrt 上查询 wan6 IPv6

把脚本放到路由器上，或直接在仓库内参考执行：

```sh
sh scripts/get-wan6-ip.sh
```

其内部等价于：

```sh
ifstatus wan6 | jsonfilter -e '@["ipv6-address"][0].address'
```

如果 `wan6` 没有获取到 IPv6，命令可能没有输出——请回到 [常用服务配置](docs/05-common-services.md) 与 [常见问题排查](docs/07-troubleshooting.md)，检查上游网络、接口状态和 DDNS 配置。

### 工具三：LuCI v2rayA 快捷入口

前提：OpenWrt 已安装并启用 v2rayA。把入口文件上传到 LuCI 总览页 include 目录：

```sh
scp luci/05_v2raya.js root@192.168.8.1:/www/luci-static/resources/view/status/include/05_v2raya.js
```

刷新 LuCI 总览页后会出现打开 v2rayA 管理页的按钮，脚本使用当前 LuCI 页面 hostname 拼出地址：

```text
http://<路由器地址>:2017/
```

如果你的 LAN 地址不是 `192.168.8.1`，请把 `scp` 命令中的 IP 换成实际路由器地址。

---

## 遇到问题先查这里

按症状快速定位对应文档：

| 症状 / 阶段 | 去哪查 |
| --- | --- |
| 网络阶段卡住、网段切换不明白 | [接线与电脑网络设置](docs/01-network-topology.md) |
| Telnet 连不上、U-Boot Recovery / 刷入 OpenWrt 出错 | [刷机流程](docs/02-flashing.md) |
| LuCI 打不开、中文界面、WiFi、WAN 配置问题 | [OpenWrt 首次启动](docs/03-first-boot.md) |
| eMMC overlay 容量异常 | [eMMC 扩容到 overlay](docs/04-emmc-overlay.md) |
| DNS、UPnP、SQM、dynv6 相关 | [常用服务配置](docs/05-common-services.md) |
| v2rayA 节点、启动超时、快捷入口 | [v2rayA 分流与快捷入口](docs/06-v2raya.md) |
| 代理影响 LuCI、DDNS 更新失败、Recovery 进不去 | [常见问题排查](docs/07-troubleshooting.md) |

> **路由器红灯不一定是刷坏了。** 先按 [常见问题排查](docs/07-troubleshooting.md) 测试 `192.168.68.1`、`192.168.1.1`、`192.168.8.1` 的 ping 与 80 / 22 端口，再下结论。

---

## 高频问答

**Q：这个项目能自动刷机吗？**
不能。仓库只提供文档、静态阅读站点、校验清单和辅助脚本，不会自动开启 Telnet、写 U-Boot 或刷入 OpenWrt。

**Q：为什么仓库里没有固件 bin 文件？**
固件和 Xray 二进制体积较大且来源需要单独核对，当前 Git 仓库只保留 `firmware/README.md` 和 `firmware/SHA256SUMS.txt`。刷机前必须自行确认下载来源和 SHA256。

**Q：本地站点打不开章节怎么办？**
不要直接双击 HTML 文件。在仓库根目录运行 `python -m http.server 18765 --bind 127.0.0.1`，再访问 `http://127.0.0.1:18765/`。

**Q：有 Docker、API 或 CLI 吗？**
没有 Docker 部署、后端 API 或项目专用 CLI。README 中的命令都是文档阅读、校验、网络诊断或 OpenWrt 配置命令。

**Q：Windows 诊断脚本会修改我的网卡吗？**
默认不会。只有传入 `-ConfigureStaticIPs` 且 PowerShell 以管理员权限运行时，脚本才会添加常见静态 IPv4 地址。

---

## 参与贡献与维护约定

本项目没有编译步骤。修改文档或站点后，用本地 HTTP 服务手动验证即可：

```sh
python -m http.server 18765 --bind 127.0.0.1
```

提交修改前建议自查：

- README 与 `docs/*.md` 里的链接是否都能打开
- `site/` 页面能否正常加载文档弹窗与搜索结果
- 命令示例是否仍对应真实文件路径
- 新增示例是否使用占位符，不含任何私人配置
- 固件文件名是否与 `firmware/SHA256SUMS.txt` 一致

**提交 issue、PR、截图或公开命令输出前，务必删除以下敏感信息：**

- OpenWrt root 密码、WiFi 密码、宽带账号
- SSH 私钥、公钥、设备密钥
- dynv6 Token、域名管理 Token
- v2rayA 订阅链接、节点地址、UUID、Reality 私钥与公钥组合
- 家庭公网 IP、MAC、SN
- 带个人信息的 LuCI、v2rayA、dynv6、运营商后台截图

更多细节见 [SECURITY.md](SECURITY.md)。相关维护文件：[CONTRIBUTING.md](CONTRIBUTING.md)（贡献说明）、[DISCLAIMER.md](DISCLAIMER.md)（免责声明）、[CREDITS.md](CREDITS.md)（来源与致谢）、[CHANGELOG.md](CHANGELOG.md)（更新日志）。

---

## 交流与反馈

- **QQ 交流群**：`1016190748`
- **Telegram**：[https://t.me/lenmoC](https://t.me/lenmoC)

提反馈时请注明：设备型号、当前系统、当前路由器 IP、电脑系统、连接方式，附上已尝试过的命令输出，并**先删除所有敏感信息**。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
