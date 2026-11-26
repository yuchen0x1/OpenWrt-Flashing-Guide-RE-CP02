# 02. 刷机流程

本章只描述流程，不提供 stock 固件下开启 Telnet 的辅助代码。原因是这类代码通常依赖 stock 后台接口和固件漏洞，公开仓库不适合直接收录。请仅对自己拥有的设备使用可信来源的脚本，并确认来源。

## 总览

完整流程：

1. 登录 stock 路由器后台。
2. 在 stock 固件中开启 Telnet。
3. Telnet 进入路由器，备份关键分区。
4. 上传并写入第三方 U-Boot。
5. 进入 U-Boot Web Recovery。
6. 上传 OpenWrt `sysupgrade.bin`。
7. 等待路由器重启，进入 OpenWrt。

## 1. 登录 stock 后台

电脑有线网卡设置：

```text
IP：192.168.68.2
掩码：255.255.255.0
网关：留空
```

浏览器打开：

```text
http://192.168.68.1/
```

用你的路由器管理密码登录。

## 2. 开启 Telnet

在 stock 后台登录状态下，使用你信任的 Telnet 辅助方式开启 Telnet。成功后，一般可以从电脑连接：

```powershell
telnet 192.168.68.1
```

常见登录：

```text
用户名：root
密码：stock 后台管理密码
```

如果连接不上，先确认：

- 电脑有线 IP 是 `192.168.68.2/24`。
- 能 ping 通 `192.168.68.1`。
- stock 后台仍然处于登录状态。
- Telnet 辅助面板提示已经开启成功。

## 3. 检查分区

Telnet 登录后先查看设备分区，确认是 RE-CP-02 的结构：

```sh
lsblk
cat /proc/mtd
fdisk -l /dev/mmcblk0
```

典型关键信息：

```text
/dev/mtd0  Bootloader
/dev/mtd2  Factory
/dev/mmcblk0  约 57 GiB
```

如果看到的设备名、容量和分区明显不一致，不要继续写入。

## 4. 备份关键分区

至少备份 Bootloader 和 Factory。Factory 通常包含无线校准数据、MAC 等信息，非常重要。

```sh
dd if=/dev/mtd0 of=/tmp/mtd0_Bootloader.bin
dd if=/dev/mtd2 of=/tmp/mtd2_Factory.bin
```

然后把备份文件传回电脑保存。可选方式：

```sh
# 如果路由器支持 scp
scp /tmp/mtd0_Bootloader.bin /tmp/mtd2_Factory.bin <YOUR_PC_USER>@<YOUR_PC_IP>:/path/to/backup/
```

如果没有 SCP，可以用 stock 固件自带的文件服务、TFTP、Samba 或其他方式取回。总之不要只放在路由器里。

可选：备份 eMMC 前部数据（约 1.2 GiB）。必须先确认 `/dev/mmcblk0p4` 是可写的数据分区，且它的起始扇区不早于 `2508800`，避免备份文件落入正在读取的源范围；不能确认时不要使用此示例，改用独立外部存储。确认目标文件不存在、空间足够，再执行：

```sh
# 先用 fdisk -l /dev/mmcblk0 核对分区起始扇区；不要忽略挂载失败
mkdir -p /mnt/mmcblk0p4
mount /dev/mmcblk0p4 /mnt/mmcblk0p4 &&
df -h /mnt/mmcblk0p4 &&
test ! -e /mnt/mmcblk0p4/backup.img &&
dd if=/dev/mmcblk0 of=/mnt/mmcblk0p4/backup.img bs=512 count=2508800 &&
sync
```

如果挂载提示已挂载，请先用 `mount` 核对其实际挂载点，再单独确认剩余步骤；不要把 `mount` 的失败改成忽略后继续。完成后把备份取回电脑，并检查文件大小为 `1284505600` 字节。

## 5. 上传第三方 U-Boot

把 `u-boot-mt7621-68.bin` 传到路由器 `/tmp/`。

方式 A：电脑开临时 HTTP 服务。

在电脑固件目录运行：

```powershell
python -m http.server 8000
```

路由器上下载：

```sh
cd /tmp
wget http://192.168.68.2:8000/u-boot-mt7621-68.bin
```

方式 B：TFTP。

电脑用 Tftpd64 指向固件目录，路由器上下载：

```sh
cd /tmp
tftp -g -r u-boot-mt7621-68.bin 192.168.68.2
```

下载后检查文件大小，并在路由器上再次核对 SHA256，避免传输错误后直接写入 Bootloader：

```sh
ls -lh /tmp/u-boot-mt7621-68.bin
printf '%s  %s\n' \
  805e6fca1cb553c19a1f227b506d2dcbc2dc1a9ed95c3f14373fae42dd4a203b \
  /tmp/u-boot-mt7621-68.bin | sha256sum -c -
```

只有使用本仓库清单对应的 U-Boot 且输出 `OK` 才继续。使用其他构建时，必须先从可信发布者取得对应校验值，不能仅凭文件同名或非零大小判断可刷写。

## 6. 写入第三方 U-Boot

这是高风险步骤。确认文件完整后再写：

```sh
mtd write /tmp/u-boot-mt7621-68.bin /dev/mtd0
sync
```

写完先不要乱断电。命令返回正常后，再准备进入 Recovery。

## 7. 进入 U-Boot Recovery

1. 电脑有线网卡保持 `192.168.68.2/24`。
2. 路由器断电。
3. 按住路由器 Joy 键不放。
4. 插电。
5. 持续按住约 5-10 秒。
6. 浏览器打开 `http://192.168.68.1/`。
7. 页面显示 `MediaTek U-Boot System Recovery Mode` 即成功。

## 8. 刷入 OpenWrt

在上传镜像前，先确认当前 U-Boot 与分区布局属于哪一类：

- 官方标准布局：设备树/分区与 OpenWrt 官方 `jdcloud,re-cp-02` 一致，可使用官方 25.12.6 `sysupgrade.bin`。
- 第三方 U-Boot 或魔改布局：必须使用与该 U-Boot、固件起始地址和 Factory/MAC 数据布局配套的镜像。

如果无法确认，先停止，不要用官方镜像或其他 MT7621 设备镜像试刷。尤其不要把固件从 `0x30000` 起始的魔改方案与官方标准布局混用；详细边界见 [官方更新、备份与回滚](09-official-upgrade.md)。

在 U-Boot Recovery 页面选择并上传，镜像按当前设备布局二选一。

走本指南主线（已按第 6 步写入 `u-boot-mt7621-68.bin` 第三方 U-Boot）的设备，使用 [准备工作](00-preparation.md) 里准备的配套镜像：

```text
openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
```

官方标准布局（未刷第三方 U-Boot）的设备，使用官方 25.12.6 镜像：

```text
openwrt-25.12.6-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
```

两类镜像不可混用。上传前必须再次确认设备型号并校验对应 SHA256；第三方 U-Boot/魔改分区设备不要照抄官方这一行。

上传后等待路由器自动写入和重启。不要中途断电。

OpenWrt 启动后，状态灯常见表现是绿灯常亮。电脑有线网卡改回 DHCP，然后访问：

```text
http://192.168.1.1/
```

如果你已经在后续步骤把 LAN 改成 `192.168.8.1`，则访问：

```text
http://192.168.8.1/
```
