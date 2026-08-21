<div align="center">

# JDCloud RE-CP-02 OpenWrt 刷机与家庭网关配置指南

> 面向新手的鲁班二代 / 京东云无线宝 RE-CP-02 刷 OpenWrt 25.12 的整理项目

</div>

## 📖 项目简介

这是一个面向新手的鲁班二代 / 京东云无线宝 RE-CP-02 刷 OpenWrt 25.12 的整理项目。内容来自一次真实刷机过程，并参考原教程重新整理成可公开发布的文档、固件清单、通用诊断脚本和 LuCI 快捷入口示例。

- 适用设备：JDCloud RE-CP-02 / LuBan / r4310，MT7621 平台
- 示例系统：OpenWrt 25.12.x，刷机后示例 LAN 地址为 `192.168.8.1`
- 项目版本：v1.0.0

## 🎯 这个项目包含什么

- 完整中文刷机流程：从 stock 固件开启 Telnet，到备份、刷 U-Boot、U-Boot Recovery 刷 OpenWrt
- 实际联网方式说明：手机热点给电脑上网，电脑网线连路由器，路由器 WAN 口接光猫
- OpenWrt 首次启动后的常用配置：中文界面、LAN 地址、WiFi、DNS/DoH、广告过滤、UPnP、SQM、dynv6 DDNS、v2rayA 分流
- eMMC 全量扩容到 overlay 的步骤
- `firmware/` 中整理的 U-Boot、initramfs 和 sysupgrade 固件文件，以及 SHA256 校验清单
- Windows 网络诊断脚本和 OpenWrt IPv6 查询小脚本
- LuCI 总览页 v2rayA 快捷入口示例

## 📁 推荐阅读顺序

1. [准备工作与文件说明](docs/00-preparation.md)
2. [接线与电脑网络设置](docs/01-network-topology.md)
3. 后续按文档目录顺序推进刷机与配置

## 🚀 网页版阅读

仓库根目录包含一个零依赖的静态阅读界面，适合在本地集中浏览刷机流程、固件和排障章节：

```powershell
python -m http.server 18765 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:18765/`。网页入口支持章节弹窗、正文搜索、SHA256 复制、浅色模式和手机端布局。

## ⚠️ 重要提醒

- 刷机、写入 U-Boot、重建 eMMC 分区都有**变砖风险**，不要在不确认设备型号和固件来源的情况下执行
- `firmware/` 目录是实测留档，不代表官方最新版本；刷机前必须自行核对来源、文件名、设备型号和 SHA256
- 本仓库不包含 stock 固件下开启 Telnet 的辅助代码、私人节点订阅、WiFi 密码、DDNS Token、SSH 密钥或任何个人配置
- 扩容章节会删除内置 eMMC 旧分区，只有在确认旧数据可以清空时再执行
- v2rayA、代理、DDNS 等功能请遵守所在地法律法规和网络服务条款

## ⚙️ 默认配置

| 项目 | 说明 |
| --- | --- |
| 后台/密码 | 无。按 OpenWrt 默认规则，首次进入 LuCI 后自行设置管理密码 |
| LAN 地址 | 刷机后示例 `192.168.8.1` |

## 📬 联系方式

- QQ 交流群：`1016190748`
- Telegram：[https://t.me/lenmoC](https://t.me/lenmoC)

联系或反馈时，请说明你使用的版本、运行平台和具体问题。