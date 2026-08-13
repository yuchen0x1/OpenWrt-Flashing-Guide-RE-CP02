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

可选：备份 eMMC 前部数据。这个文件比较大，确认目标目录空间足够再执行：

```sh
# 如果 /mnt/mmcblk0p4 不存在，先挂载可写分区
mount /dev/mmcblk0p4 /mnt/mmcblk0p4 || true
ls /mnt/mmcblk0p4
dd if=/dev/mmcblk0 of=/mnt/mmcblk0p4/backup.img bs=512 count=2508800
```

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

下载后检查文件大小，确认不是 0 字节：

```sh
ls -lh /tmp/u-boot-mt7621-68.bin
```

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

在 U-Boot Recovery 页面选择并上传：

```text
openwrt-25.12.0-rc2-含TF卡驱动-ramips-mt7621-jdcloud_re-cp-02-squashfs-sysupgrade.bin
```

上传后等待路由器自动写入和重启。不要中途断电。

OpenWrt 启动后，状态灯常见表现是绿灯常亮。电脑有线网卡改回 DHCP，然后访问：

```text
http://192.168.1.1/
```

如果你已经在后续步骤把 LAN 改成 `192.168.8.1`，则访问：

```text
http://192.168.8.1/
```
