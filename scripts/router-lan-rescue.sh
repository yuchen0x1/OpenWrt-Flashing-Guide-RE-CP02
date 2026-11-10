#!/bin/sh
# RE-CP-02 网络急救：把 LAN 恢复到可访问状态（对应 docs/03 与 docs/07 的常见翻车点）
#
# 典型场景：改错 LAN IP / 网关、关掉了 LAN DHCP、关掉了 WiFi，导致 LuCI 和 SSH
# 都进不去。本脚本把 LAN 一键恢复为静态 192.168.8.1/24 并重新打开 DHCP 服务端，
# 可选同时打开所有 WiFi；顺带打印 WAN 状态与排查提示。
#
# 默认干跑预览，加 --apply 才实际执行；执行中还需要交互输入 YES 二次确认。
# 注意 --apply 会重启 network/dnsmasq，SSH 会瞬断，用新地址重连即可。
#
# 用法：
#   sh router-lan-rescue.sh                  预览当前网络状态与将执行的动作
#   sh router-lan-rescue.sh --apply          实际执行（含 YES 二次确认）
#   sh router-lan-rescue.sh --ip 192.168.8.1 指定恢复后的 LAN 地址（默认 192.168.8.1）
#   sh router-lan-rescue.sh --wifi           同时打开所有 WiFi radio
#
# 本脚本不会改动 root 密码、防火墙规则与 WAN 配置。

set -u

# 用法文本取自文件头部注释块，按注释块边界截取
usage() {
  sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit 0
}

APPLY=0
WIFI=0
RESCUE_IP="192.168.8.1"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --wifi) WIFI=1 ;;
    --ip) [ $# -ge 2 ] || { echo "--ip 需要参数" >&2; exit 2; }; RESCUE_IP="$2"; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1（-h 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "[rescue] $*"; }
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
command -v uci >/dev/null 2>&1 || die "缺少 uci 命令"

# --ip 只接受合法 IPv4 点分十进制
case "$RESCUE_IP" in
  [0-9]*.[0-9]*.[0-9]*.[0-9]*)
    IFS=. ; set -- $RESCUE_IP ; IFS=' '
    for octet in "$@"; do
      case "$octet" in '' | *[!0-9]*) die "--ip 不是合法 IPv4 地址: $RESCUE_IP" ;; esac
      [ "$octet" -le 255 ] || die "--ip 不是合法 IPv4 地址: $RESCUE_IP"
    done
    [ $# -eq 4 ] || die "--ip 不是合法 IPv4 地址: $RESCUE_IP"
    ;;
  *) die "--ip 不是合法 IPv4 地址: $RESCUE_IP" ;;
esac

log "---- 当前状态 ----"
LAN_PROTO=$(uci -q get network.lan.proto 2>/dev/null || echo '?')
LAN_IP=$(uci -q get network.lan.ipaddr 2>/dev/null || echo '?')
LAN_MASK=$(uci -q get network.lan.netmask 2>/dev/null || echo '?')
LAN_GW=$(uci -q get network.lan.gateway 2>/dev/null || echo '（未设置）')
DHCP_IGNORE=$(uci -q get dhcp.lan.ignore 2>/dev/null || echo '0（默认）')
log "LAN: proto=$LAN_PROTO ip=$LAN_IP mask=$LAN_MASK gateway=$LAN_GW"
log "LAN DHCP ignore: $DHCP_IGNORE"
if command -v ip >/dev/null 2>&1; then
  ip -4 addr show br-lan 2>/dev/null | grep inet | sed 's/^/[rescue]   实际地址: /' || log "br-lan 上没有任何 IPv4 地址（这就是进不去后台的直接原因之一）"
fi

if [ "$LAN_IP" = "$RESCUE_IP" ] && [ "$DHCP_IGNORE" != "1" ]; then
  log "LAN 已经是 $RESCUE_IP 且 DHCP 未关闭，似乎无需急救。仍要继续请加 --apply"
fi

log "---- 将要执行的动作 ----"
log "  1. LAN 改回静态 $RESCUE_IP/255.255.255.0（清除 gateway，避免双重网关冲突）"
log "  2. 重新打开 LAN DHCP 服务端（ignore=0，地址池 100-249）"
[ "$WIFI" = "1" ] && log "  3. 打开所有 WiFi radio（disabled=0）并 wifi up"
log "  4. 重启 network + dnsmasq（SSH 会瞬断，等 1-2 分钟用新地址重连）"
log "  提示：电脑网卡改回自动获取 IP，浏览器打开 http://$RESCUE_IP/"
log "----"

if [ "$APPLY" != "1" ]; then
  log "干跑结束。加 --apply 执行（会再次要求输入 YES）"
  exit 0
fi

printf '即将修改 LAN 配置并重启网络服务，SSH 会瞬断。\n确认请输入 YES（其他任意输入取消）: '
read -r ANSWER
[ "$ANSWER" = "YES" ] || { log "已取消"; exit 2; }

# ---- 1. LAN 恢复静态地址 ----
run uci set network.lan.proto='static'
run uci set network.lan.ipaddr="$RESCUE_IP"
run uci set network.lan.netmask='255.255.255.0'
run uci -q delete network.lan.gateway
run uci -q delete network.lan.dns

# ---- 2. 重新打开 LAN DHCP ----
if ! uci -q get dhcp.lan >/dev/null 2>&1; then
  run uci set dhcp.lan='dhcp'
  run uci set dhcp.lan.interface='lan'
fi
run uci set dhcp.lan.ignore='0'
run uci set dhcp.lan.start='100'
run uci set dhcp.lan.limit='150'

# ---- 3. 可选：打开 WiFi ----
if [ "$WIFI" = "1" ]; then
  RADIOS=$(uci -q show wireless 2>/dev/null | grep '=wifi-device' | cut -d. -f2 | cut -d= -f1)
  if [ -n "$RADIOS" ]; then
    for radio in $RADIOS; do
      log "WiFi radio: $radio（disabled=$(uci -q get wireless.$radio.disabled 2>/dev/null || echo 0)）"
    done
    DEFS=$(uci -q show wireless 2>/dev/null | grep '=wifi-iface' | cut -d. -f2 | cut -d= -f1)
    for def in $DEFS; do
      run uci -q set "wireless.$def.disabled=0"
    done
  else
    log "警告: wireless 下没有 radio 配置，跳过 WiFi 步骤"
    WIFI=0
  fi
fi

run uci commit network
run uci commit dhcp
[ "$WIFI" = "1" ] && run uci commit wireless

# ---- 4. 重启服务 ----
run /etc/init.d/network restart
run /etc/init.d/dnsmasq restart
if [ "$WIFI" = "1" ] && command -v wifi >/dev/null 2>&1; then
  run wifi
fi

log "---- 完成 ----"
log "等 1-2 分钟让路由器完成切换，然后："
log "  1. 电脑有线网卡改回自动获取 IP（DHCP）"
log "  2. 浏览器打开 http://$RESCUE_IP/  或  ssh root@$RESCUE_IP"
log "  3. Windows 端如果仍拿不到地址: ipconfig /release && ipconfig /renew && ipconfig /flushdns"
log "WAN 不通时再查: /etc/init.d/network restart 后 ping -c 4 223.5.5.5（详见 docs/07）"
