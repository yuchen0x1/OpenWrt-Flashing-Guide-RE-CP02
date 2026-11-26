# 00. 准备工作与文件说明

## 设备与版本

本指南面向：

- 京东云无线宝鲁班二代 / JDCloud RE-CP-02 / r4310
- MT7621 平台
- 目标系统：OpenWrt 25.12.x

不同批次、不同 stock 固件可能有差异。开始前先确认外壳型号、后台型号、固件文件名都能对应 RE-CP-02。

## 需要准备的文件

本仓库 `firmware/` 目录只保留文件说明与 SHA256 清单，不包含固件二进制。请自行从可信来源获取对应文件，并放在电脑的一个独立目录里，例如 `D:\JD-Cloud RE-CP-02\firmware\`：

```text
u-boot-mt7621-68.bin
openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin  # 可选
```

说明：

- `u-boot-mt7621-68.bin`：第三方 U-Boot，用来提供 Web Recovery。
- `squashfs-sysupgrade.bin`：最终刷入的 OpenWrt 固件。
- `initramfs-kernel.bin`：临时启动用，普通 Web Recovery 刷机通常用不到。

下载后请先对照 `firmware/SHA256SUMS.txt` 校验 SHA256，并记录下载地址。历史第三方构建仅有清单记录，不能从本仓库下载；使用其他版本时应向其发布者独立核对来源、设备型号与校验值。

Windows 下校验文件哈希：

```powershell
certutil -hashfile .\firmware\openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
certutil -hashfile .\firmware\u-boot-mt7621-68.bin SHA256
```

Linux / macOS 下校验：

```sh
sha256sum firmware/openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
sha256sum firmware/u-boot-mt7621-68.bin
```

## 需要准备的工具

- 浏览器：Chrome / Edge 均可。
- 终端：Windows Terminal、PowerShell、MobaXterm、PuTTY 都可以。
- Telnet 客户端：Windows 可在“启用或关闭 Windows 功能”里打开 Telnet Client，也可以用 MobaXterm。
- 文件传输方式：Tftpd64、SCP、或临时 HTTP 文件服务器。
- 手机热点：给电脑提供互联网，方便下载包和查资料。
- 网线：电脑直连路由器 LAN 口。

## 敏感信息不要公开

公开教程、提 issue 或发截图前，请删掉：

- 路由器 root 密码
- WiFi 密码
- SSH 私钥、公钥
- dynv6 Token
- v2rayA 订阅链接和节点
- MAC、SN、公网 IP、宽带账号

推荐统一使用这些占位符：

```text
<ROUTER_IP>
<YOUR_WIFI_PASSWORD>
<YOUR_DYNV6_TOKEN>
<YOUR_DOMAIN>.dynv6.net
<YOUR_SUBSCRIPTION_URL>
```

## 风险最高的步骤

下面这些命令执行错了会直接变砖或清空数据：

```sh
mtd write u-boot-mt7621-68.bin /dev/mtd0
fdisk /dev/mmcblk0
mkfs.ext4 /dev/mmcblk0p1
dd if=/dev/mmcblk0 ...
```

执行前必须确认设备型号、文件名、分区名、路径都正确。
