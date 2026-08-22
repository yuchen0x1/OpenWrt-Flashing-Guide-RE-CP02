<div align="center">

# JDCloud RE-CP-02 OpenWrt 刷机与家庭网关配置指南

> 面向新手的鲁班二代 / 京东云无线宝 RE-CP-02 刷 OpenWrt 25.12 的整理项目

</div>

## 项目解决什么问题

鲁班二代 / 京东云无线宝 RE-CP-02 的刷机过程会跨过 stock 固件、Telnet、U-Boot Recovery、OpenWrt 首次启动、eMMC 扩容和家庭网关服务配置几个阶段。新手最容易卡在设备网段切换、固件文件选择、分区备份、恢复入口和刷机后网络服务配置上。

本项目把一次真实 RE-CP-02 刷 OpenWrt 25.12 的过程整理成公开文档和本地阅读站点，目标是帮助你：

- 判断当前设备阶段应该连接哪个地址，例如 `192.168.68.1`、`192.168.1.1` 或 `192.168.8.1`
- 按顺序完成备份、写入 U-Boot、通过 U-Boot Recovery 刷入 OpenWrt
- 在刷机后完成 LAN、WAN、WiFi、DNS、DDNS、v2rayA、SQM、UPnP 等常用配置
- 在出问题时快速定位是电脑网卡、路由器地址、Recovery 入口还是 OpenWrt 服务异常

本项目不是自动刷机工具，也不提供 stock 固件下开启 Telnet 的辅助代码；所有高风险写入动作都需要你手动确认设备型号、文件来源和 SHA256。

## 主要功能

- **完整中文刷机文档**：覆盖准备工作、接线方式、备份分区、写入 U-Boot、Recovery 刷机、首次启动、eMMC overlay 扩容和常见故障排查。
- **本地静态阅读站点**：`site/` 提供零构建的网页界面，支持章节弹窗、正文搜索、SHA256 复制、浅色模式和手机端布局。
- **固件校验清单**：`firmware/SHA256SUMS.txt` 和 `firmware/README.md` 记录 U-Boot、initramfs、sysupgrade 固件和 Xray 文件的用途与 SHA256。
- **网络诊断脚本**：`scripts/router-net-diagnose.ps1` 可在 Windows 上检查有线网卡、可选配置静态 IP，并测试 stock / Recovery / OpenWrt 常见地址和端口。
- **OpenWrt 辅助脚本**：`scripts/get-wan6-ip.sh` 用于在路由器上读取 `wan6` 的 IPv6 地址。
- **LuCI 快捷入口示例**：`luci/05_v2raya.js` 可作为 LuCI 总览页中打开 v2rayA 管理页的快捷入口。
- **TFTP 辅助材料**：`Tftpd64/` 包含 Windows 下 TFTP 传文件可能用到的 Tftpd64 配置和程序文件。

## 安装方法

这个项目以文档和静态网页为主，不需要构建或安装依赖。推荐按下面方式准备：

1. 下载本仓库源码，或使用 Git 克隆到本地。
2. 确认本机有一个现代浏览器。
3. 如果要运行本地阅读站点，准备 Python 3，或使用任意静态 HTTP 服务器。
4. 如果要使用 Windows 网络诊断脚本，准备 PowerShell；如需自动添加静态 IP，请用管理员权限打开 PowerShell。
5. 如果要实际刷机，另行准备网线、可信固件文件、SHA256 校验工具，以及可用的文件传输方式，例如临时 HTTP 服务、SCP 或 TFTP。

可选的固件下载与校验：

```powershell
certutil -hashfile .\openwrt-25.12.x-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
```

校验值请对照：

```text
firmware/SHA256SUMS.txt
```

## 使用方法

### 1. 阅读刷机流程

建议按文档顺序阅读：

1. [准备工作与文件说明](docs/00-preparation.md)
2. [接线与电脑网络设置](docs/01-network-topology.md)
3. [刷机流程](docs/02-flashing.md)
4. [OpenWrt 首次启动](docs/03-first-boot.md)
5. [eMMC 扩容到 overlay](docs/04-emmc-overlay.md)
6. [常用服务配置](docs/05-common-services.md)
7. [v2rayA 分流与快捷入口](docs/06-v2raya.md)
8. [常见问题排查](docs/07-troubleshooting.md)
9. [路由器全球分流恢复](docs/08-router-global-access.md)

### 2. 启动本地阅读站点

在项目根目录运行：

```powershell
python -m http.server 18765 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:18765/
```

根目录的 `index.html` 会跳转到 `site/`。网页适合集中查看章节、搜索正文和复制固件 SHA256。

### 3. 运行 Windows 网络诊断

普通诊断：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1
```

指定网卡并尝试添加常见静态 IP：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1 -AdapterName "Ethernet" -ConfigureStaticIPs
```

脚本默认输出到：

```text
router-net-diagnose-result.txt
```

### 4. 在 OpenWrt 上查询 wan6 IPv6

把脚本放到路由器或在仓库环境中参考执行：

```sh
sh scripts/get-wan6-ip.sh
```

脚本内部调用：

```sh
ifstatus wan6 | jsonfilter -e '@["ipv6-address"][0].address'
```

### 5. 添加 LuCI v2rayA 快捷入口

如果你的 OpenWrt 已安装并启用 v2rayA，可参考文档把快捷入口文件上传到 LuCI 对应目录：

```sh
scp luci/05_v2raya.js root@192.168.8.1:/www/luci-static/resources/view/status/include/05_v2raya.js
```

之后在 LuCI 总览页可看到打开 `http://<路由器地址>:2017/` 的快捷入口。

## 输入输出示例

### 示例 1：本地阅读站点

输入：

```powershell
python -m http.server 18765 --bind 127.0.0.1
```

输出：

```text
Serving HTTP on 127.0.0.1 port 18765 ...
```

浏览器访问 `http://127.0.0.1:18765/` 后，预期看到 RE-CP-02 OpenWrt Lab 页面，可以打开章节、搜索文档并复制 SHA256。

### 示例 2：Windows 网络诊断脚本

输入：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\router-net-diagnose.ps1 -AdapterName "Ethernet"
```

输出文件示例：

```text
Started: 2026-08-22T10:00:00.0000000+08:00
IsAdmin: False
Adapter: Name=Ethernet; ifIndex=12; Status=Up; LinkSpeed=1 Gbps

Target: Stock or U-Boot Recovery 192.168.68.1
Ping: True
TCP 80: True

Target: OpenWrt custom LAN 192.168.8.1
Ping: False
TCP 80: False
TCP 22: False
TCP 2017: False
Finished: 2026-08-22T10:00:05.0000000+08:00
```

实际结果会随你的网卡名称、路由器阶段、IP 配置和端口开放情况变化。

### 示例 3：OpenWrt 查询 wan6 IPv6

输入：

```sh
sh scripts/get-wan6-ip.sh
```

输出示例：

```text
240e:xxxx:xxxx:xxxx::1234
```

如果 `wan6` 未获取到 IPv6，命令可能没有输出，需要回到 [常用服务配置](docs/05-common-services.md) 和 [常见问题排查](docs/07-troubleshooting.md) 检查上游网络与接口状态。

## 重要提醒

- 刷机、写入 U-Boot、重建 eMMC 分区都有变砖风险；不要在不确认设备型号和固件来源的情况下执行。
- `firmware/` 的 SHA256 清单是实测留档，不代表官方最新版本；刷机前必须自行核对来源、文件名、设备型号和 SHA256。
- 本仓库不包含私人节点订阅、WiFi 密码、DDNS Token、SSH 密钥或任何个人配置。
- 扩容章节会删除内置 eMMC 旧分区，只有在确认旧数据可以清空时再执行。
- v2rayA、代理、DDNS 等功能请遵守所在地法律法规和网络服务条款。

## 默认配置

| 项目 | 说明 |
| --- | --- |
| 适用设备 | JDCloud RE-CP-02 / LuBan / r4310，MT7621 平台 |
| 示例系统 | OpenWrt 25.12.x |
| Recovery 地址 | 常见为 `192.168.68.1` |
| OpenWrt 默认地址 | 常见为 `192.168.1.1` |
| 文档示例 LAN 地址 | `192.168.8.1` |
| 后台/密码 | 无预设密码；首次进入 LuCI 后自行设置管理密码 |

## 联系方式

- QQ 交流群：`1016190748`
- Telegram：[https://t.me/lenmoC](https://t.me/lenmoC)

联系或反馈时，请说明你使用的版本、运行平台、设备阶段和具体问题。
