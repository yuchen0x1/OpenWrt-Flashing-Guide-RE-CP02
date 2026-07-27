# Firmware 文件说明

本目录整理本次刷机使用的 U-Boot、initramfs 和 sysupgrade 固件文件。刷机前请自行核对来源、设备型号和 SHA256。

## 文件清单

| 文件 | 用途 | SHA256 |
| --- | --- | --- |
| `u-boot-mt7621-68.bin` | 第三方 U-Boot，提供 Web Recovery | `805e6fca1cb553c19a1f227b506d2dcbc2dc1a9ed95c3f14373fae42dd4a203b` |
| `openwrt-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | 临时启动用 initramfs | `e2585e6bd6177075c98ebdc00f5bf2c30df89d815eba37374f6e07925ca5a2a1` |
| `openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，含 TF 卡驱动 | `eed012f12aea3768fff9b303367576f8b6bafd80d7835e4645739f445a26d14c` |
| `openwrt-25.12.0-rc2-无TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | sysupgrade 固件，无 TF 卡驱动 | `3624d4aeed6777e733ae472734dd9b84e6714e91f5fdc64723c2dc069c294f3d` |
| `openwrt-25.12.1-自用-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | 自用 sysupgrade 固件 | `7aae9a00623cc4276f8c7e7e2dbfccb519a8514a4fa4880cc94bd66eb5e50529` |

同一份校验信息也保存在 `SHA256SUMS.txt`。

下载后请校验 SHA256：

```powershell
certutil -hashfile .\openwrt-25.12.x-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin SHA256
```

刷机前确认文件名里包含：

```text
ramips-mt7621-jdcloud_re-cp-02
squashfs-sysupgrade
```

不要拿其他 MT7621 设备的固件混刷。
