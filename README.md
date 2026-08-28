# JDCloud RE-CP-02 OpenWrt 刷机与家庭网关配置指南

面向京东云无线宝鲁班二代 / JDCloud RE-CP-02 / r4310 的 OpenWrt 25.12.x 刷机、恢复、首次启动和家庭网关配置文档。

本仓库以中文文档和本地静态阅读站点为主，配套提供固件 SHA256 清单、Windows 网络诊断脚本、OpenWrt 辅助脚本和 LuCI v2rayA 快捷入口示例。

## 适用范围与边界

适用范围：

- 设备：京东云无线宝鲁班二代 / JDCloud RE-CP-02 / r4310
- 平台：ramips / mt7621
- 示例系统：OpenWrt 25.12.x
- 常见地址：stock / U-Boot Recovery 为 `192.168.68.1`，OpenWrt 初始地址通常为 `192.168.1.1`，文档示例 LAN 地址为 `192.168.8.1`

项目边界：

- 不是自动刷机工具，不会自动连接或修改路由器。
- 不收录 stock 固件下开启 Telnet 的辅助代码，只说明流程和风险。
- 不内置私人节点、订阅、WiFi 密码、DDNS Token、SSH 密钥或完整个人配置。
- 固件二进制不在 Git 仓库中，`firmware/` 只保留文件说明和 SHA256 清单；下载来源、文件名、设备型号和哈希需要刷机前自行核对。
- 刷机、写入 U-Boot、重建 eMMC 分区都有变砖或数据丢失风险，只应在自己拥有或被授权维护的设备上操作。

## 核心功能

- **刷机主流程文档**：覆盖准备工作、接线、Telnet 阶段、分区备份、写入 U-Boot、U-Boot Web Recovery 和 OpenWrt 首次启动。
- **家庭网关配置说明**：覆盖 LAN、WAN、WiFi、中文界面、DNS / DoH、广告过滤、UPnP、SQM、dynv6 DDNS 和 v2rayA 分流。
- **eMMC overlay 扩容文档**：记录 RE-CP-02 内置 eMMC 重新分区、格式化、迁移 overlay 和验证步骤。
- **本地静态阅读站点**：`site/` 提供零构建网页，支持章节弹窗、正文搜索、代码复制、SHA256 复制、浅色模式和移动端布局。
- **固件校验清单**：`firmware/SHA256SUMS.txt` 记录 U-Boot、initramfs、sysupgrade 固件和 Xray 文件的 SHA256。
- **辅助脚本**：`scripts/router-net-diagnose.ps1` 用于 Windows 网络诊断，`scripts/get-wan6-ip.sh` 用于 OpenWrt 上读取 `wan6` IPv6 地址。
- **LuCI 快捷入口示例**：`luci/05_v2raya.js` 可放入 LuCI 总览页，用来打开当前路由器地址的 `:2017` v2rayA 管理页。

## 快速开始

克隆仓库：

```sh
git clone https://github.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02.git
cd OpenWrt-Flashing-Guide-RE-CP02
```

启动本地阅读站点：

```sh
python -m http.server 18765 --bind 127.0.0.1
```

浏览器打开：

```text
http://127.0.0.1:18765/
```

根目录 `index.html` 会跳转到 `site/`。站点通过浏览器 `fetch()` 读取 `docs/*.md`，建议使用上面的本地 HTTP 服务访问；直接双击 HTML 文件时，部分浏览器可能因为本地文件权限而无法加载章节内容。

## 系统要求

阅读和运行站点：

| 项目 | 要求 |
| --- | --- |
| 浏览器 | Chrome、Edge、Firefox 或其他现代浏览器 |
| 本地 HTTP 服务 | Python 3，或任意静态文件服务器 |
| 构建依赖 | 无 npm、pnpm、yarn、pip 或其他项目依赖 |
| 构建命令 | 无需构建 |
| 环境变量 | 无需配置环境变量 |
| Docker | 当前项目不提供 Dockerfile 或 Compose 配置 |

实际刷机和配置：

| 项目 | 要求 |
| --- | --- |
| 设备 | JDCloud RE-CP-02 / LuBan / r4310 |
| 电脑 | Windows、Linux 或 macOS 均可；文档示例偏 Windows 和 OpenWrt shell |
| 网络 | 网线直连路由器 LAN 口；必要时电脑另连手机热点查资料或下载包 |
| 终端工具 | PowerShell、Windows Terminal、MobaXterm、PuTTY、ssh / scp 等 |
| Telnet 客户端 | Windows 可启用 Telnet Client，或使用 MobaXterm 等工具 |
| 文件传输 | 临时 HTTP 服务、SCP、TFTP 或 stock 固件可用的文件服务 |
| 校验工具 | Windows `certutil`，Linux / macOS `sha256sum` |

## 项目结构

```text
.
├── README.md                         # 项目入口文档
├── index.html                        # 跳转到 site/ 的根入口
├── docs/                             # 9 篇刷机、配置和故障排查文档
├── site/                             # 零构建静态阅读站点
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/                       # 站点图片资源
├── firmware/
│   ├── README.md                     # 固件文件用途说明
│   └── SHA256SUMS.txt                # 固件和 Xray 文件 SHA256 清单
├── scripts/
│   ├── router-net-diagnose.ps1       # Windows 网络诊断脚本
│   └── get-wan6-ip.sh                # OpenWrt wan6 IPv6 查询脚本
├── luci/
│   └── 05_v2raya.js                  # LuCI v2rayA 快捷入口示例
├── Tftpd64/                          # TFTP 辅助材料
├── SECURITY.md                       # 敏感信息与安全报告说明
├── DISCLAIMER.md                     # 免责声明
├── CONTRIBUTING.md                   # 贡献说明
├── CREDITS.md                        # 来源与致谢
├── CHANGELOG.md                      # 更新日志
└── LICENSE                           # MIT License
```

## 文档阅读顺序

建议按下面顺序操作，不要跳过备份和校验步骤：

1. [准备工作与文件说明](docs/00-preparation.md)
2. [接线与电脑网络设置](docs/01-network-topology.md)
3. [刷机流程](docs/02-flashing.md)
4. [OpenWrt 首次启动](docs/03-first-boot.md)
5. [eMMC 扩容到 overlay](docs/04-emmc-overlay.md)
6. [常用服务配置](docs/05-common-services.md)
7. [v2rayA 分流与快捷入口](docs/06-v2raya.md)
8. [常见问题排查](docs/07-troubleshooting.md)
9. [路由器全球分流恢复](docs/08-router-global-access.md)

## 固件下载与校验

`firmware/SHA256SUMS.txt` 当前记录 6 个文件的校验值：

| 文件 | 用途 |
| --- | --- |
| `u-boot-mt7621-68.bin` | 第三方 U-Boot，提供 Web Recovery |
| `openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | 临时启动用 initramfs |
| `openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，含 TF 卡驱动 |
| `openwrt-25.12.0-rc2-无TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，无 TF 卡驱动 |
| `openwrt-25.12.1-自用-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | 作者自用 sysupgrade 固件 |
| `xray-softfloat-26.7.28-linux-mipsle` | v2rayA / PassWall 恢复使用的 linux/mipsle soft-float Xray 核心 |

> ⚠️ 需要人工确认：当前 Git 仓库不包含这些二进制文件，`gh release list` 未返回可用 GitHub Release。刷机前请自行确认下载来源、设备型号、文件名和 SHA256。不要把其他 MT7621 设备固件混刷到 RE-CP-02。

Windows 校验示例：

```powershell
certutil -hashfile .\openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
certutil -hashfile .\u-boot-mt7621-68.bin SHA256
```

Linux / macOS 校验示例：

```sh
sha256sum openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
sha256sum u-boot-mt7621-68.bin
```

把输出值与下面文件逐项比对：

```text
firmware/SHA256SUMS.txt
```

## 使用方法

### 1. 启动本地阅读站点

在项目根目录运行：

```sh
python -m http.server 18765 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:18765/
```

站点能力来自 `site/index.html` 和 `site/app.js`：可以查看流程卡片、打开 Markdown 章节弹窗、搜索正文、复制代码块、复制固件 SHA256、切换浅色 / 深色模式。

### 2. 运行 Windows 网络诊断

普通诊断：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1
```

指定网卡并尝试添加常见静态 IP：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1 -AdapterName "Ethernet" -ConfigureStaticIPs
```

脚本默认写出结果到：

```text
router-net-diagnose-result.txt
```

参数说明：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-AdapterName` | 空 | 指定有线网卡名称；为空时脚本自动选择处于 Up 状态且不像虚拟 / WiFi / VPN 的网卡 |
| `-ResultPath` | `.\router-net-diagnose-result.txt` | 诊断结果输出路径 |
| `-ConfigureStaticIPs` | 关闭 | 使用管理员权限时，为目标网卡添加 `192.168.68.2`、`192.168.1.2`、`192.168.8.2` 三个 `/24` IPv4 地址 |
| `-TcpTimeoutMs` | `1000` | TCP 端口探测超时时间，单位毫秒 |

脚本会检查：

- 当前是否管理员权限
- 目标网卡名称、接口索引、状态和链路速率
- 当前有线 IPv4 地址
- `192.168.68.1` 的 80 / 22 / 23 端口
- `192.168.1.1` 的 80 / 22 端口
- `192.168.8.1` 的 80 / 22 / 2017 端口
- 当前 ARP 表

### 3. 在 OpenWrt 上查询 wan6 IPv6

把脚本放到 OpenWrt 路由器上，或在仓库中参考脚本内容执行：

```sh
sh scripts/get-wan6-ip.sh
```

脚本实际执行：

```sh
ifstatus wan6 | jsonfilter -e '@["ipv6-address"][0].address'
```

如果 `wan6` 未获取到 IPv6，命令可能没有输出，需要回到 [常用服务配置](docs/05-common-services.md) 和 [常见问题排查](docs/07-troubleshooting.md) 检查上游网络、接口状态和 DDNS 配置。

### 4. 添加 LuCI v2rayA 快捷入口

如果 OpenWrt 已安装并启用 v2rayA，可以把快捷入口上传到 LuCI 总览页 include 目录：

```sh
scp luci/05_v2raya.js root@192.168.8.1:/www/luci-static/resources/view/status/include/05_v2raya.js
```

刷新 LuCI 总览页后，会出现打开 v2rayA 管理页的按钮。脚本会使用当前 LuCI 页面 hostname 拼出：

```text
http://<路由器地址>:2017/
```

如果你的 OpenWrt LAN 不是 `192.168.8.1`，请把 `scp` 命令中的 IP 改成实际路由器地址。

## 常见问题

**Q：这个项目能自动刷机吗？**

不能。仓库只提供文档、静态阅读站点、校验清单和辅助脚本，不会自动开启 Telnet、写 U-Boot 或刷入 OpenWrt。

**Q：为什么仓库里没有固件 bin 文件？**

固件和 Xray 二进制体积较大且来源需要单独核对，当前 Git 仓库只保留 `firmware/README.md` 和 `firmware/SHA256SUMS.txt`。刷机前必须自行确认下载来源和 SHA256。

**Q：本地站点打不开章节怎么办？**

不要直接双击 HTML 文件。请在仓库根目录运行 `python -m http.server 18765 --bind 127.0.0.1`，再访问 `http://127.0.0.1:18765/`。

**Q：路由器红灯是不是刷坏了？**

不一定。先按 [常见问题排查](docs/07-troubleshooting.md) 测试 `192.168.68.1`、`192.168.1.1`、`192.168.8.1` 的 ping 和 80 / 22 端口。

**Q：Windows 诊断脚本会修改我的网卡吗？**

默认不会。只有传入 `-ConfigureStaticIPs` 且 PowerShell 以管理员权限运行时，脚本才会添加常见静态 IPv4 地址。

**Q：有 Docker、API 或 CLI 吗？**

没有 Docker 部署、后端 API 或项目专用 CLI。README 中的命令都是文档阅读、校验、网络诊断或 OpenWrt 配置命令。

## 故障排查入口

- 网络阶段和网段切换：查看 [接线与电脑网络设置](docs/01-network-topology.md)。
- Telnet、U-Boot Recovery、刷入 OpenWrt：查看 [刷机流程](docs/02-flashing.md)。
- LuCI、中文界面、WiFi、WAN：查看 [OpenWrt 首次启动](docs/03-first-boot.md)。
- eMMC overlay 容量异常：查看 [eMMC 扩容到 overlay](docs/04-emmc-overlay.md)。
- DNS、UPnP、SQM、dynv6：查看 [常用服务配置](docs/05-common-services.md)。
- v2rayA 节点、启动超时、快捷入口：查看 [v2rayA 分流与快捷入口](docs/06-v2raya.md)。
- 代理影响 LuCI、DDNS 更新失败、Recovery 进不去：查看 [常见问题排查](docs/07-troubleshooting.md)。

## 安全注意事项

提交 issue、PR、截图或公开命令输出前，请删除：

- OpenWrt root 密码、WiFi 密码、宽带账号
- SSH 私钥、公钥、设备密钥
- dynv6 Token、域名管理 Token
- v2rayA 订阅链接、节点地址、UUID、Reality 私钥、公钥组合
- 家庭公网 IP、MAC、SN
- 带个人信息的 LuCI、v2rayA、dynv6、运营商后台截图

更多说明见 [SECURITY.md](SECURITY.md) 和 [DISCLAIMER.md](DISCLAIMER.md)。

## 开发与维护

当前项目没有编译步骤。修改文档或站点后，可以用本地 HTTP 服务手动验证：

```sh
python -m http.server 18765 --bind 127.0.0.1
```

建议检查：

- README 和 `docs/*.md` 链接是否能打开
- `site/` 页面是否能加载文档弹窗和搜索结果
- 命令示例是否仍对应真实文件路径
- 新增示例是否使用占位符，不包含私人配置
- 固件文件名是否与 `firmware/SHA256SUMS.txt` 一致

维护文件：

- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献说明
- [SECURITY.md](SECURITY.md)：敏感信息与安全报告说明
- [DISCLAIMER.md](DISCLAIMER.md)：免责声明
- [CREDITS.md](CREDITS.md)：来源与致谢
- [CHANGELOG.md](CHANGELOG.md)：更新日志
- [LICENSE](LICENSE)：MIT License

## License

本项目使用 MIT License，详见 [LICENSE](LICENSE)。

## 联系方式

- QQ 交流群：`1016190748`
- Telegram：[https://t.me/lenmoC](https://t.me/lenmoC)

反馈问题时，请说明设备型号、当前系统、当前路由器 IP、电脑系统、连接方式和已经尝试过的命令输出，并先删除所有敏感信息。
