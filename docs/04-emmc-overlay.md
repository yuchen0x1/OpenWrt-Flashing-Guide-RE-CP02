# 04. eMMC 扩容到 overlay

RE-CP-02 内置 eMMC 容量约 64 GB。默认 OpenWrt overlay 可能很小，装插件会很快不够用。可以把 eMMC 重新分区并挂载为 `/overlay`。

## 开始前确认

本章会清空 `/dev/mmcblk0` 上的旧分区。只有在确认旧数据可以删除时再执行。

先检查：

```sh
lsblk
df -h
fdisk -l /dev/mmcblk0
mount
cat /proc/swaps
```

确认看到的是内置 eMMC：

```text
/dev/mmcblk0  约 57 GiB
```

不要对 `/dev/mtd*` 或其他磁盘执行本章格式化命令。

如果 `/dev/mmcblk0` 的任何分区正在用作根文件系统、`/overlay`、其他挂载点或 swap，先停止本章操作，切换到不依赖此磁盘的恢复环境。不要在线重建正在使用的磁盘分区表。迁移前也要确认 `/mnt` 未被占用、没有待提交的 UCI 配置，并把当前配置备份取回电脑。

## 1. 安装依赖

```sh
apk update
apk add lsblk e2fsprogs kmod-fs-ext4 block-mount
```

## 2. 重建分区表

进入 fdisk：

```sh
fdisk /dev/mmcblk0
```

交互操作参考：

```text
p       # 查看当前分区
d       # 删除分区，按提示删除所有旧分区
n       # 新建分区
1       # 分区号 1
回车    # 默认起始扇区
回车    # 默认结束扇区，使用全部空间
w       # 保存退出
```

如果 fdisk 提示 GPT 损坏、磁盘正在使用或无法重读分区表，先退出并查明原因，不要忽略警告继续格式化。不同版本 fdisk 输出略有差异，关键目标是最终只保留：

```text
/dev/mmcblk0p1
```

## 3. 格式化新分区

再次确认是 `mmcblk0p1`：

```sh
lsblk
```

格式化：

```sh
mkfs.ext4 /dev/mmcblk0p1
```

如果提示已有文件系统并要求确认，确认你已经备份并允许清空后再继续。

## 4. 迁移当前 overlay 数据

确认 `/overlay/upper` 存在，并且 `/mnt` 是未挂载的空目录。在新建的 SSH 会话中执行以下代码块，任一步失败都会停止该会话，**不要在失败后继续第 5 步或重启**：

```sh
set -e
test -d /overlay/upper
mkdir -p /mnt
mount /dev/mmcblk0p1 /mnt
cp -a /overlay/. /mnt/
```

这里的 `cp -a /overlay/. /mnt/` 会复制隐藏文件和权限。保持新分区挂载，下一步还需要把更新后的挂载配置同步到新 overlay；不要现在卸载。

## 5. 配置开机挂载

```sh
uci -q delete fstab.overlay || true
uci set fstab.overlay='mount'
uci set fstab.overlay.device='/dev/mmcblk0p1'
uci set fstab.overlay.target='/overlay'
uci set fstab.overlay.enabled='1'
uci commit fstab
mkdir -p /mnt/upper/etc/config
cp /etc/config/fstab /mnt/upper/etc/config/fstab
sync
umount /mnt
```

以上命令继续在第 4 步启用了 `set -e` 的同一 SSH 会话执行。必须先复制成功，再配置挂载，并把新的 `fstab` 同步到迁移后的 `upper/etc/config/`；只修改当前系统的 `/etc/config/fstab` 会导致下次启动使用的新 overlay 缺少挂载配置。任何复制、提交或卸载失败都应先排查，不能直接重启。

重启：

```sh
reboot
```

## 6. 验证

重启后执行：

```sh
df -h /overlay
df -h /
mount | grep overlay
```

成功时 `/overlay` 或根目录 overlay 会显示几十 GB 可用空间，例如 50 GB 以上。

如果重启后进不去 LuCI，先等 2-3 分钟，再尝试 SSH。仍不行时，进入 failsafe 或重新刷 OpenWrt，恢复备份。
