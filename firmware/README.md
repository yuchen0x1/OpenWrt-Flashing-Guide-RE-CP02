# Firmware 文件说明

本目录整理本次刷机使用的 U-Boot、initramfs、sysupgrade 固件和恢复用 Xray 文件的 SHA256 清单。固件二进制体积较大，已移出仓库。第三方历史构建没有在本仓库发布；官方 OpenWrt 镜像请从官方 Downloads 或 Firmware Selector 获取，刷机前请自行核对来源、设备型号、官方更新状态和 SHA256。

OpenWrt 官方已提供 RE-CP-02 的 25.12.6 稳定镜像。官方镜像不放入本仓库，常规更新请优先使用 [官方更新与回滚说明](../docs/09-official-upgrade.md)，并从官方 Downloads 或 Firmware Selector 获取文件。

## 文件清单

| 文件 | 用途 | SHA256 |
| --- | --- | --- |
| `u-boot-mt7621-68.bin` | 第三方 U-Boot，提供 Web Recovery | `805e6fca1cb553c19a1f227b506d2dcbc2dc1a9ed95c3f14373fae42dd4a203b` |
| `openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | 临时启动用 initramfs | `e2585e6bd6177075c98ebdc00f5bf2c30df89d815eba37374f6e07925ca5a2a1` |
| `openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，含 TF 卡驱动 | `eed012f12aea3768fff9b303367576f8b6bafd80d7835e4645739f445a26d14c` |
| `openwrt-25.12.0-rc2-无TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，无 TF 卡驱动 | `3624d4aeed6777e733ae472734dd9b84e6714e91f5fdc64723c2dc069c294f3d` |
| `openwrt-25.12.1-自用-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | 自用 sysupgrade 固件 | `7aae9a00623cc4276f8c7e7e2dbfccb519a8514a4fa4880cc94bd66eb5e50529` |
| `xray-softfloat-26.7.28-linux-mipsle` | v2rayA 恢复使用的 linux/mipsle soft-float Xray 核心 | `0d9ceda10ab70c4ce5caee839fd4eaba5015a27ec566eb31dbb78d66cb857623` |

同一份校验信息也保存在 `SHA256SUMS.txt`。下载到本地后，请将文件放在任意目录，并按实际路径执行校验。

下载后请校验 SHA256：

```powershell
certutil -hashfile .\openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
```

## 官方 25.12.6 基线（2026-11-09 核对）

| 文件 | 官方下载地址 | SHA256 |
| --- | --- | --- |
| `openwrt-25.12.6-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | `https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/` | `30995d91889e8db1e79e7ca0dc0297c94d1877c2d832b1db341072989f9076c0` |
| `openwrt-25.12.6-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | `https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/` | `e3544d3ae3be733dc4ce71f34fa9acdcdd9a30bf8f58f3c1753f57a18d6a7645` |

这两项来自官方 `sha256sums` 文件的当前记录。下载后仍需再次读取官方清单核对；若版本或哈希发生变化，以官方页面为准。

刷机前确认文件名里包含：

```text
ramips-mt7621-jdcloud_re-cp-02
squashfs-sysupgrade
```

不要拿其他 MT7621 设备的固件混刷。
