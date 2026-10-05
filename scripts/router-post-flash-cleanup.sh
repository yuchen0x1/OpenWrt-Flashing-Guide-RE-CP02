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

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

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
    log "服务 $svc 已停用"
  else
    log "服务 $svc 不存在，跳过"
  fi
done

# 2. 清理 DDNS 占位配置（整节删除）
if command -v uci >/dev/null 2>&1 && uci -q show ddns >/dev/null 2>&1; then
  uci -q show ddns | grep -E "(lookup_host|domain)='yourhost\.example\.com'" | cut -d. -f1-2 | sort -u | while IFS= read -r section; do
    [ -n "$section" ] || continue
    log "发现 DDNS 占位配置 section: $section"
    run uci -q delete "$section"
  done
  if [ "$APPLY" = "1" ]; then
    if uci -q show ddns 2>/dev/null | grep -q "=ddns"; then
      log "仍有真实 DDNS 配置，保留服务"
    else
      run /etc/init.d/ddns disable
      log "DDNS 已无任何配置，服务停用"
    fi
    run uci commit ddns
  fi
else
  log "无 ddns 配置或无 uci，跳过"
fi

# 3. 磁盘/内存快照，方便刷机后留档
log "---- 当前状态 ----"
log "固件: $(cat /etc/openwrt_release 2>/dev/null | grep DISTRIB_RELEASE || echo unknown)"
log "模型: $(cat /tmp/sysinfo/model 2>/dev/null || echo unknown)"
df -h /overlay 2>/dev/null | tail -n 1 | while IFS= read -r l; do log "overlay: $l"; done

if [ "$APPLY" != "1" ]; then
  log "预览结束。确认后执行: sh $0 --apply"
else
  log "清理完成。别忘了：LuCI -> 系统 -> 管理权 设置 root 密码（空密码等于局域网裸奔）"
fi
