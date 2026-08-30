# 09. 官方更新、备份与回滚

本章用于已经运行 OpenWrt 的 RE-CP-02。它把官方固件更新、软件包迁移和失败回滚整理成一条可重复检查的路径。首次从 stock 或第三方 U-Boot 刷入 OpenWrt，仍应先阅读 [刷机流程](02-flashing.md)。

## 1. 先确认设备身份

在 SSH 中确认设备没有被误认成其他 MT7621 型号：

```sh
cat /tmp/sysinfo/model
ubus call system board
cat /etc/openwrt_release
```

目标设备应包含以下关键信息：

```text
JD-Cloud RE-CP-02
board: jdcloud,re-cp-02
target: ramips/mt7621
```

如果设备树、闪存布局或 U-Boot 与此不一致，不要套用本章镜像。

## 2. 当前官方固件基线

截至 2026-08-30，OpenWrt Firmware Selector 和官方下载目录均提供 RE-CP-02 的 25.12.5 镜像。官方文件名、下载地址和 SHA256 如下：

| 文件 | 用途 | SHA256 |
| --- | --- | --- |
| `openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin` | 已运行 OpenWrt 的常规升级 | `8fd7653aaf8233e0c49ea1f014e9b61c2b3aad90186b53880e9d77c8fdf02dc0` |
| `openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-initramfs-kernel.bin` | 临时启动或特定恢复流程 | `b14c9a57d24f71af95b1636b720d3e1d9b95606a8ccc8efa28ddbca4df62fc77` |

官方下载目录：

```text
https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/
```

普通升级只使用文件名以 `-squashfs-sysupgrade.bin` 结尾的镜像。`initramfs-kernel.bin` 不等同于常规 sysupgrade 镜像，不要混用。

## 3. 备份配置和已安装软件

先生成备份，并把备份复制到电脑或其他安全设备，不能只留在路由器的 `/tmp`：

```sh
sysupgrade --create-backup /tmp/re-cp-02-backup.tar.gz
```

电脑上执行：

```sh
scp root@<ROUTER_IP>:/tmp/re-cp-02-backup.tar.gz .\re-cp-02-backup.tar.gz
```

同时记录已安装软件，便于全新刷写后恢复：

```sh
apk info -vv > /tmp/re-cp-02-packages.txt
scp root@<ROUTER_IP>:/tmp/re-cp-02-packages.txt .\re-cp-02-packages.txt
```

备份中可能包含密码哈希、密钥和网络配置。不要把备份文件提交到公开仓库。

## 4. 下载并校验官方镜像

路由器上的升级文件应放在 `/tmp`，因为 sysupgrade 会卸载持久化存储。下面命令只适用于 25.12.5 官方镜像：

```sh
cd /tmp
wget -O openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin \
  https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621/openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
printf '%s  %s\n' \
  8fd7653aaf8233e0c49ea1f014e9b61c2b3aad90186b53880e9d77c8fdf02dc0 \
  openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin | sha256sum -c -
```

只有看到 `OK` 才能继续。校验失败、文件大小异常、下载中断或设备型号不匹配时，删除 `/tmp` 文件并停止操作。

## 5. 选择升级方式

### 方式 A：官方 owut

OpenWrt 25.12 使用 `apk`。可以安装官方 `owut`，让它在升级前检查版本、设备、软件包和配置兼容性：

```sh
apk -U add owut
owut check
```

同一 25.12 分支内的常规升级可使用：

```sh
owut upgrade
```

看到配置不兼容、软件包降级、目标分支不明确或校验失败时，不要使用强制参数。先导出备份并阅读完整错误信息。

### 方式 B：手动 sysupgrade

确认备份已取回电脑、镜像校验为 `OK`、路由器供电稳定后执行：

```sh
sysupgrade -v /tmp/openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
```

默认会尝试保留配置。跨大版本、曾经修改过分区、安装了大量第三方包，或校验提示配置不兼容时，应先采用全新配置方案，而不是盲目保留旧配置：

```sh
sysupgrade -n /tmp/openwrt-25.12.5-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
```

`-n` 会清除旧配置。只有在备份已经复制到电脑并且你准备好重新配置 LAN、WiFi、WAN 和服务时才使用。

## 6. 升级后的验证顺序

等待设备完全重启，再按下面顺序验证：

```sh
ubus call system board
cat /etc/openwrt_release
df -h
ip -br address
ping -c 4 192.168.1.1
```

确认以下项目：

- `board` 仍为 `jdcloud,re-cp-02`。
- 版本为预期的 25.12.x。
- LAN 地址、网卡和 WiFi 配置符合预期。
- overlay 有足够可用空间。
- SSH、LuCI、DNS 和 WAN 按需恢复。
- 代理、DDNS、UPnP 等服务逐项启动并查看日志，不要一次性批量启用。

## 7. 官方镜像与设备专属布局的边界

社区项目 `1-1-2/OpenWrt-Custom` 的 MIT 许可文档记录了 RE-CP-02 的设备专属 DTS、MAC/EEPROM 读取和 16 MiB 闪存布局实践；其中部分方案会把固件起始地址调整到 `0x30000`，并明确提醒不能与其他分区布局混刷。

因此必须区分两类镜像：

- 官方标准布局镜像：适用于与官方设备树和分区布局匹配的设备。
- 特定第三方 U-Boot / 魔改分区镜像：只能与对应 U-Boot、分区起始地址和备份方案配套使用。

不知道当前设备属于哪一类时，不要刷写。先备份 `/proc/mtd`、`ubus call system board` 和原始关键分区，并回到 [刷机流程](02-flashing.md) 排查。

## 8. 回滚原则

升级失败后不要连续重复刷写。先：

1. 等待 3 分钟，确认设备是否只是服务尚未启动。
2. 通过有线网络检查 `192.168.1.1` 或已配置的 LAN 地址。
3. 通过 SSH 查看 `logread`、`df -h` 和 `ubus call system board`。
4. 使用已复制到电脑的配置备份重新配置或恢复。
5. 只有确认进入 U-Boot Recovery 且镜像与布局匹配后，才执行恢复流程。

不要把未确认来源的 U-Boot、Factory、EEPROM、分区镜像或其他 MT7621 设备固件混用。

## 参考资料

- OpenWrt RE-CP-02 官方设备页：<https://openwrt.org/toh/hwdata/jdcloud/jdcloud_re-cp-02>
- OpenWrt Firmware Selector：<https://firmware-selector.openwrt.org/?id=jdcloud_re-cp-02&target=ramips%2Fmt7621&version=25.12.5>
- OpenWrt CLI 升级说明：<https://openwrt.org/docs/guide-user/installation/sysupgrade.cli>
- OpenWrt owut 说明：<https://openwrt.org/docs/guide-user/installation/sysupgrade.owut>
- RE-CP-02 社区设备实践：<https://github.com/1-1-2/OpenWrt-Custom/blob/main/RE-CP-02.md>
