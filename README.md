# JDCloud RE-CP-02 OpenWrt 25.12 刷机与家庭网关配置指南

这是一个面向新手的鲁班二代 / 京东云无线宝 RE-CP-02 刷 OpenWrt 25.12 的整理项目。内容来自一次真实刷机过程，并参考原教程重新整理成可公开发布的文档、固件清单、通用诊断脚本和 LuCI 快捷入口示例。

> 适用设备：JDCloud RE-CP-02 / LuBan / r4310，MT7621 平台。  
> 示例系统：OpenWrt 25.12.x，刷机后示例 LAN 地址为 `192.168.8.1`。

## 重要提醒

- 刷机、写入 U-Boot、重建 eMMC 分区都有变砖风险。不要在不确认设备型号和固件来源的情况下执行。
- `firmware/` 目录包含本次整理使用的固件和 U-Boot 文件。刷机前必须自行核对来源、文件名、设备型号和 SHA256。
- 本仓库不包含 stock 固件下用于开启 Telnet 的辅助代码、私人节点订阅、WiFi 密码、DDNS Token、SSH 密钥或任何个人配置。
- 扩容章节会删除内置 eMMC 旧分区。只有在确认旧数据可以清空时再执行。
- v2rayA、代理、DDNS 等功能请遵守所在地法律法规和网络服务条款。

## 这个项目包含什么

- 完整中文刷机流程：从 stock 固件开启 Telnet，到备份、刷 U-Boot、U-Boot Recovery 刷 OpenWrt。
- 你这次实际使用的联网方式说明：手机热点给电脑上网，电脑网线连路由器，路由器 WAN 口接光猫。
- OpenWrt 首次启动后的常用配置：中文界面、LAN 地址、WiFi、DNS/DoH、广告过滤、UPnP、SQM、dynv6 DDNS、v2rayA 分流。
- eMMC 全量扩容到 overlay 的步骤。
- `firmware/` 中整理的 U-Boot、initramfs 和 sysupgrade 固件文件，以及 SHA256 校验清单。
- Windows 网络诊断脚本和 OpenWrt IPv6 查询小脚本。
- LuCI 总览页 v2rayA 快捷入口示例。

## 推荐阅读顺序

1. [准备工作与文件说明](docs/00-preparation.md)
2. [接线与电脑网络设置](docs/01-network-topology.md)
3. [刷机流程](docs/02-flashing.md)
4. [OpenWrt 首次启动](docs/03-first-boot.md)
5. [eMMC 扩容到 overlay](docs/04-emmc-overlay.md)
6. [常用服务配置](docs/05-common-services.md)
7. [v2rayA 分流与 LuCI 快捷入口](docs/06-v2raya.md)
8. [常见问题排查](docs/07-troubleshooting.md)

## 最终效果示例

一次成功配置后的状态大概是：

- OpenWrt 管理地址：`http://192.168.8.1/`
- eMMC overlay：约 55 GB 可用
- WiFi：自定义 SSID，WPA2/WPA3 强密码
- DNS：本地 dnsmasq + DoH 上游
- 广告过滤：adblock-fast
- UPnP：按需开启
- SQM：500M 宽带可先填 `470000/470000` kbit/s
- DDNS：dynv6 域名自动更新
- v2rayA：`http://192.168.8.1:2017/`，按规则自动直连或代理

## 来源与致谢

完整来源说明见 [CREDITS.md](CREDITS.md)。

- 原始参考：color_thoro，恩山无线论坛《鲁班 (RE-CP-02 r4310) 免拆刷机 OpenWrt 25.12 与 eMMC 全量扩容》  
  https://www.right.com.cn/forum/thread-8479163-1-1.html
- Telnet 辅助代码参考：  
  https://space.bilibili.com/661919716
- 固件与 U-Boot 参考：广东小杨考生《RE-CP-02 刷机 openwrt25.12笔记》  
  https://www.cnblogs.com/mianfeijiaocheng/p/19395633

## 相关官方资料

- [OpenWrt Firmware Selector](https://firmware-selector.openwrt.org/)
- [OpenWrt 25.12 发布说明](https://openwrt.org/releases/25.12/notes-25.12.0)
- [OpenWrt apk 包管理器说明](https://openwrt.org/docs/guide-user/additional-software/apk)
- [OpenWrt SQM 文档](https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm)
- [v2rayA OpenWrt 安装文档](https://v2raya.org/en/docs/prologue/installation/openwrt/)
- [dynv6](https://dynv6.com/)

## 固件文件

本仓库 `firmware/` 目录目前整理了这些本地文件：

- `u-boot-mt7621-68.bin`
- `openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin`
- `openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin`
- `openwrt-25.12.0-rc2-无TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin`
- `openwrt-25.12.1-自用-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin`

刷机前请使用 [firmware/SHA256SUMS.txt](firmware/SHA256SUMS.txt) 校验文件。

## 仓库不提供的内容

- MobaXterm、PuTTY 等第三方工具包
- stock 固件下用于开启 Telnet 的辅助代码
- v2rayA 节点、订阅链接、服务商账号

## License

文档和脚本使用 MIT License。第三方固件、OpenWrt、v2rayA、Xray、dynv6 等各自遵循其原项目许可证。
