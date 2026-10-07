#!/bin/sh
# RE-CP-02 刷机后清理：停用/移除无用功能（默认干跑预览，加 --apply 才实际执行）
#
# 默认处理（基于 2026-10-05 对该路由器的实机检查）：
#   1. ttyd  网页终端 —— 空密码环境下等于把 root shell 挂在局域网上，纯风险无收益
#   2. ddns  占位配置 —— myddns_ipv4/ipv6 还是 yourhost.example.com 演示值，服务处于 Stopped
#
# 不碰的东西：PassWall、UPnP（有活跃转发在用）、Adblock、nlbw、WoL、网络/无线/防火墙配置。
# 想连这些一起停，在下面的 OPTIONAL_DISABLE 里加名字（如 "ttyd nlbw wol"）。
#
# 用法：
#   sh router-post-flash-cleanup.sh            预览将执行的动作（不改任何东西）
#   sh router-post-flash-cleanup.sh --apply    实际执行
#
# 本脚本永远不会修改 root 密码——那是你自己的事：
#   LuCI -> 系统 -> 管理权，或 passwd 命令。

set -u

# 用法文本取自文件头部注释块，按注释块边界截取
usage() {
  sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit 0
}

APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1（-h 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

DISABLE_SERVICES="${DISABLE_SERVICES:-ttyd}"

log() { echo "[cleanup] $*"; }
run() {
  if [ "$APPLY" = "1" ]; then
    log "执行: $*"
    "$@"
  else
    log "（预览）$*"
  fi
}

[ -r /etc/openwrt_release ] || { echo "本机不是 OpenWrt/ImmortalWrt 系统" >&2; exit 2; }
[ "$APPLY" = "1" ] || log "干跑模式：只预览不修改。确认无误后加 --apply 执行"

# 1. 停用服务
for svc in $DISABLE_SERVICES; do
  if [ -x "/etc/init.d/$svc" ]; then
    run /etc/init.d/$svc stop
    run /etc/init.d/$svc disable
    if [ "$APPLY" = "1" ]; then
      log "服务 $svc 已停用"
    else
      log "（预览）服务 $svc 将被停用（stop + disable）"
    fi
  else
    log "服务 $svc 不存在，跳过"
  fi
done

# 2. 清理 DDNS 占位配置（整节删除）
# 决策（删完后是否还有真实配置、要不要停服务）与日志在干跑和执行两种模式下都要输出，
# 因此这里不把判断包在 APPLY 分支里，只把「改动类动作」交给 run() 处理。
if command -v uci >/dev/null 2>&1 && uci -q show ddns >/dev/null 2>&1; then
  PLACEHOLDER_SECTIONS=$(uci -q show ddns | grep -E "(lookup_host|domain)='yourhost\.example\.com'" | cut -d. -f1-2 | sort -u)
  _ph_count=$(printf '%s\n' "$PLACEHOLDER_SECTIONS" | grep -c .)
  _ddns_count=$(uci -q show ddns | grep -c "=ddns")
  printf '%s\n' "$PLACEHOLDER_SECTIONS" | while IFS= read -r section; do
    [ -n "$section" ] || continue
    log "发现 DDNS 占位配置 section: $section"
    run uci -q delete "$section"
  done
  _remain=$((_ddns_count - _ph_count))
  if [ "$_remain" -gt 0 ]; then
    log "删除占位后仍有 $_remain 个真实 DDNS 配置，保留 ddns 服务"
  else
    run /etc/init.d/ddns disable
    log "DDNS 已无任何真实配置，服务将随本次执行停用"
  fi
  run uci commit ddns
else
  log "无 ddns 配置或无 uci，跳过"
fi

# 3. 磁盘/内存快照，方便刷机后留档
log "---- 当前状态 ----"
log "固件: $(cat /etc/openwrt_release 2>/dev/null | grep DISTRIB_RELEASE || echo unknown)"
log "模型: $(cat /tmp/sysinfo/model 2>/dev/null || echo unknown)"
if df -h /overlay >/dev/null 2>&1; then
  df -h /overlay | tail -n 1 | while IFS= read -r l; do log "overlay: $l"; done
else
  log "overlay: 读取失败（恢复模式或 /overlay 未挂载？请手动执行 df -h 检查分区占用）"
fi

if [ "$APPLY" != "1" ]; then
  log "预览结束。确认后执行: sh $0 --apply"
else
  log "清理完成。别忘了：LuCI -> 系统 -> 管理权 设置 root 密码（空密码等于局域网裸奔）"
fi
