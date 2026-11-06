#!/bin/sh
# RE-CP-02 一键 eMMC 扩容 overlay（封装 docs/04-emmc-overlay.md 的手工步骤）
#
# 把内置 eMMC 整盘重建为单个 ext4 分区并挂载为 /overlay，替换 NOR 上几 MB 的
# 小 overlay。流程与 docs/04 完全一致：备份 → 重建分区表 → 格式化 → 迁移
# /overlay 数据 → 写 fstab → 重启后生效。
#
# 默认干跑预览，加 --apply 才实际执行；执行中还需要交互输入 YES 二次确认。
#
# 用法：
#   sh emmc-one-key-setup.sh                         预览将执行的动作与当前状态
#   sh emmc-one-key-setup.sh --apply                 实际执行（含 YES 二次确认）
#   sh emmc-one-key-setup.sh --device /dev/mmcblk0   显式指定设备（默认即此）
#
# 安全边界：
#   - 只接受 /dev/mmcblk0 ~ /dev/mmcblk9 形式的设备名，/dev/mtd* 一律拒绝；
#   - 检测到 /overlay 已挂在本设备上时拒绝重复迁移；
#   - 执行前自动把当前 /overlay 打包备份到 /tmp（重启前有效，可再下载留存）；
#   - 分区/格式化完成后自动校验分区节点与文件系统，失败立即中止并给手工指引。
#
# ⚠ 会清空 eMMC 上全部旧数据（含以前的下载/数据分区），执行前确认无需保留。

set -u

# 用法文本取自文件头部注释块，按注释块边界截取
usage() {
  sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit 0
}

APPLY=0
DEV="/dev/mmcblk0"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --device) [ $# -ge 2 ] || { echo "--device 需要参数" >&2; exit 2; }; DEV="$2"; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1（-h 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "[emmc-setup] $*"; }
run() {
  if [ "$APPLY" = "1" ]; then
    log "执行: $*"
    "$@"
  else
    log "（预览）$*"
  fi
}
die() { log "错误: $*"; exit 2; }

[ -r /etc/openwrt_release ] || die "本机不是 OpenWrt/ImmortalWrt 系统（找不到 /etc/openwrt_release）"
[ "$APPLY" = "1" ] || log "干跑模式：只预览不修改。确认无误后加 --apply 执行"

# ---- 设备名校验：只允许 mmcblk，拒绝 mtd 与其他任意块设备 ----
case "$DEV" in
  /dev/mmcblk[0-9]) ;;
  *) die "设备名必须是 /dev/mmcblk0 ~ /dev/mmcblk9 之一（当前: $DEV）。拒绝操作 /dev/mtd* 或其他设备" ;;
esac
[ -b "$DEV" ] || die "块设备 $DEV 不存在（lsblk 查看实际设备名）"
DEV_NAME=${DEV#/dev/}
P1="/dev/${DEV_NAME}p1"

# ---- 依赖检查 ----
MISSING=""
for cmd in fdisk mkfs.ext4 uci; do
  command -v "$cmd" >/dev/null 2>&1 || MISSING="$MISSING $cmd"
done
[ -z "$MISSING" ] || die "缺少依赖:$MISSING —— 先执行: apk update && apk add lsblk e2fsprogs kmod-fs-ext4 block-mount"

# ---- 环境快照 ----
MODEL=$(cat /tmp/sysinfo/model 2>/dev/null || echo unknown)
log "---- 当前状态 ----"
log "设备: $MODEL"
log "目标块设备: $DEV"
if command -v lsblk >/dev/null 2>&1; then
  lsblk "$DEV" 2>/dev/null || log "lsblk 显示失败（继续用 fdisk 检查）"
fi
fdisk -l "$DEV" 2>/dev/null | sed 's/^/[emmc-setup]   /'
if grep -q " /overlay " /proc/mounts; then
  CUR_OVERLAY=$(awk '$2 == "/overlay" {print $1}' /proc/mounts | head -n 1)
  log "当前 /overlay 来源: ${CUR_OVERLAY:-未知}"
  case "$CUR_OVERLAY" in
    ${DEV}*|${DEV}p*) die "检测到 /overlay 已挂载在 $DEV 上，无需重复迁移（如确要重来请先卸载）" ;;
  esac
fi
df -h /overlay 2>/dev/null | tail -n +2 | sed 's/^/[emmc-setup]   /'

# ---- 备份当前 overlay（干跑只提示，apply 才写包） ----
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="/tmp/overlay-backup-$TS.tar.gz"
if [ "$APPLY" = "1" ]; then
  log "备份当前 /overlay 到 $BACKUP（重启后失效，需要长期留存请先 scp 到电脑）"
  if tar -czf "$BACKUP" -C /overlay . 2>/dev/null; then
    log "备份完成: $(du -h "$BACKUP" 2>/dev/null | awk '{print $1}') $BACKUP"
  else
    log "警告: 备份失败（/tmp 空间不足或 tar 不可用）——继续执行前请自行确认 /overlay 数据可丢弃"
  fi
else
  log "（预览）将先把当前 /overlay 打包备份到 /tmp/overlay-backup-<时间戳>.tar.gz"
fi

# ---- 执行计划 ----
log "---- 将要执行的动作 ----"
log "  1. fdisk 重建 $DEV 分区表（o 清空 + 单主分区占满全盘）"
log "  2. mkfs.ext4 -F 格式化 $P1"
log "  3. mount $P1 /mnt && cp -a /overlay/. /mnt/ && sync && umount /mnt"
log "  4. 写 fstab：$P1 挂载为 /overlay（uci fstab.overlay）"
log "  5. 提示手动 reboot 生效"
log "----"

if [ "$APPLY" != "1" ]; then
  log "干跑结束。加 --apply 执行（会再次要求输入 YES）"
  exit 0
fi

printf '即将清空 %s 上全部数据并重建为 /overlay，此操作不可撤销。\n确认请输入 YES（其他任意输入取消）: ' "$DEV"
read -r ANSWER
[ "$ANSWER" = "YES" ] || { log "已取消"; exit 2; }

# ---- 1. 重建分区表 ----
# o: 新建 DOS 分区表（顺带清掉旧 GPT/分区）；d: 兼容个别实现（无分区时无害）；
# n p 1 两次回车: 单主分区占满；Y: util-linux fdisk 检出旧文件系统签名时的移除确认；
# w: 写入。busybox fdisk 对多余的 Y 回报 unknown command，无副作用。
log "重建分区表: $DEV"
printf 'o\nd\nn\np\n1\n\n\nY\nw\n' | fdisk "$DEV" || die "fdisk 执行失败"
sleep 2
if [ ! -b "$P1" ]; then
  command -v blockdev >/dev/null 2>&1 && blockdev --rereadpt "$DEV" 2>/dev/null
  sleep 2
fi
[ -b "$P1" ] || die "分区节点 $P1 未出现——fdisk 分区未成功，请手工执行 fdisk $DEV 后重跑本脚本（数据尚未被格式化）"
fdisk -l "$DEV" 2>/dev/null | grep -q "$P1" || log "警告: fdisk -l 未见 $P1 描述行，请人工复核后继续（Ctrl+C 中止）"

# ---- 2. 格式化 ----
log "格式化 $P1（ext4）"
run mkfs.ext4 -F "$P1" || die "mkfs.ext4 失败"

# ---- 3. 迁移 overlay 数据 ----
if grep -q " /mnt " /proc/mounts; then
  die "/mnt 已被占用（umount /mnt 后重试）"
fi
run mount "$P1" /mnt || die "挂载 $P1 失败"
run cp -a /overlay/. /mnt/
run sync
run umount /mnt
log "/overlay 数据迁移完成"

# ---- 4. 写 fstab ----
# 清掉历史遗留的 /overlay 挂载节，再写本项目命名的 fstab.overlay
EXIST_SECTS=$(uci -q show fstab 2>/dev/null | grep '=mount' | cut -d. -f2 | cut -d= -f1)
for sect in $EXIST_SECTS; do
  if [ "$(uci -q get fstab.$sect.target 2>/dev/null)" = "/overlay" ]; then
    log "删除旧 /overlay 挂载节: fstab.$sect"
    run uci -q delete "fstab.$sect"
  fi
done
run uci -q delete fstab.overlay
run uci set fstab.overlay='mount'
run uci set fstab.overlay.device="$P1"
run uci set fstab.overlay.target='/overlay'
run uci set fstab.overlay.fstype='ext4'
run uci set fstab.overlay.enabled='1'
run uci commit fstab

log "---- 完成 ----"
log "重启后生效：执行 reboot"
log "重启后验证："
log "  df -h /overlay        （应显示几十 GB 可用）"
log "  mount | grep overlay"
log "进不去 LuCI 时：等 2-3 分钟再试 SSH；仍不行走 failsafe 或重新刷机（见 docs/04 与 docs/07）"
log "备份仍在: $BACKUP（重启即失效，需要请先 scp 下载）"
