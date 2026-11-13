# 来源与致谢

本仓库是在个人实机刷机记录基础上重新整理的公开文档。整理过程中参考了以下资料，感谢原作者和相关社区的分享。

## 原始参考

- color_thoro，恩山无线论坛：《鲁班 (RE-CP-02 r4310) 免拆刷机 OpenWrt 25.12 与 eMMC 全量扩容》  
  https://www.right.com.cn/forum/thread-8479163-1-1.html

## Telnet 辅助代码参考

- Bilibili 用户空间：  
  https://space.bilibili.com/661919716

PDF 记录中说明 Telnet 代码“源自网络，添加核心逻辑注释；由于多个发布者脚本高度相似，请自行溯源”。本仓库不收录该类辅助代码正文，只保留流程说明和风险提示。

## 固件与 U-Boot 参考

- 广东小杨考生：《RE-CP-02 刷机 openwrt25.12笔记》  
  https://www.cnblogs.com/mianfeijiaocheng/p/19395633

本仓库 `firmware/` 目录中的文件来自个人本地整理。刷机前请自行核对来源、文件名、设备型号和 SHA256；如果上游作者要求调整署名或删除二进制文件，请联系维护者处理。

## 官方项目

- OpenWrt Firmware Selector: https://firmware-selector.openwrt.org/
- OpenWrt: https://openwrt.org/
- OpenWrt RE-CP-02 官方设备页： https://openwrt.org/toh/hwdata/jdcloud/jdcloud_re-cp-02
- OpenWrt 官方升级说明： https://openwrt.org/docs/guide-user/installation/sysupgrade.cli
- OpenWrt 官方 owut 说明： https://openwrt.org/docs/guide-user/installation/sysupgrade.owut
- OpenWrt 25.12 mipsel_24kc 官方包目录： https://downloads.openwrt.org/releases/packages-25.12/mipsel_24kc/
- v2rayA: https://v2raya.org/
- v2rayA OpenWrt 包项目： https://github.com/v2rayA/v2raya-openwrt
- dynv6: https://dynv6.com/

## 社区设备实践

- 1-1-2/OpenWrt-Custom： https://github.com/1-1-2/OpenWrt-Custom
  - 仓库标注为 MIT License，本文仅参考其 RE-CP-02 设备资料、DTS/分区边界和配置组织方式，不复制其源码或二进制。
- 1-1-2 的 RE-CP-02 实验补丁： https://gist.github.com/1-1-2/335dbc8e138f39fb8fe6243d424fe476
  - 该 Gist 用于技术比对和风险提示，不作为本仓库可直接刷写的固件来源。


## 2026-11-13 产品研究参考

本轮仅参考设计与行为，新增代码独立实现，没有移植第三方代码或新增依赖。源码位置、许可证及采用范围详见 [升级报告](EVOLUTION_REPORT.md)。

- [OpenWrt Firmware Selector](https://github.com/openwrt/firmware-selector-openwrt-org)：镜像用途与 SHA256 并列呈现（CC0-1.0）。
- [OpenWrt ASU](https://github.com/openwrt/asu)：输入校验和有界资源参数（GPL-2.0）。
- [owut](https://github.com/efahl/owut)：检查、下载、验证、安装分阶段（GPL-2.0-only）。
- [Docsify](https://github.com/docsifyjs/docsify)：静态文档索引与章节定位（MIT）。
- [VitePress](https://github.com/vuejs/vitepress)：标题优先的本地搜索（MIT）。
