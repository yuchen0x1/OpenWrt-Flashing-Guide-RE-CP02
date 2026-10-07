#!/bin/sh
# 读取指定接口的 IPv6 地址（默认 wan6），用于手工排查或脚本取值。
#
# 用法：
#   sh get-wan6-ip.sh            读取 wan6 的 IPv6 地址
#   sh get-wan6-ip.sh wan        读取其他接口（接口名须与 ifstatus 一致）
#   sh get-wan6-ip.sh -h         查看用法
#
# 退出码：0 取到地址  1 用法错误  2 缺少 ifstatus/jsonfilter  3 接口不存在或无 IPv6 地址
#
# 输出约定：成功时地址打到 stdout（单行，便于 $(...) 取值），其余提示一律走 stderr。

set -eu

IFACE="wan6"
case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
  -*) echo "未知参数: $1（-h 查看用法）" >&2; exit 1 ;;
  *) IFACE="$1" ;;
esac

command -v ifstatus >/dev/null 2>&1 || {
  echo "错误: 缺少 ifstatus 命令（OpenWrt 自带），无法查询接口状态" >&2
  exit 2
}
command -v jsonfilter >/dev/null 2>&1 || {
  echo "错误: 缺少 jsonfilter 命令（OpenWrt 自带），无法解析接口状态" >&2
  exit 2
}

STATUS=$(ifstatus "$IFACE" 2>/dev/null) || {
  echo "错误: 接口 $IFACE 不存在或 ifstatus 执行失败（可用 ubus list 'network.interface.*' 查看可用接口名）" >&2
  exit 3
}

ADDR=$(printf '%s\n' "$STATUS" | jsonfilter -e '@["ipv6-address"][0].address' 2>/dev/null) || ADDR=""
[ -n "$ADDR" ] || {
  echo "接口 $IFACE 当前没有 IPv6 地址（可能未下发前缀或未连接，检查: ifstatus $IFACE）" >&2
  exit 3
}

printf '%s\n' "$ADDR"
